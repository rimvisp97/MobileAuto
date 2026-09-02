import { Router, type IRouter, type Request, type Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  GetAccessMeResponse,
  InviteAccessUserBody,
  InviteAccessUserResponse,
  ListAccessUsersResponse,
  UpdateAccessUserBody,
  UpdateAccessUserParams,
  UpdateAccessUserResponse,
} from "@workspace/api-zod";
import { accessUsersTable, db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

type AccessStatus = "pending" | "approved" | "suspended";
type AccessRole = "owner" | "employee";

const ownerPermissions: Record<string, boolean> = {
  viewDashboard: true,
  viewFinancials: true,
  viewVehicles: true,
  createVehicles: true,
  editVehicles: true,
  deleteVehicles: true,
  addExpenses: true,
  sellVehicles: true,
  viewParts: true,
  manageDonors: true,
  manageParts: true,
  sellParts: true,
  manageSettings: true,
};

function primaryEmail(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return (
    user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    `${user.id}@unknown.local`
  );
}

function displayName(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    primaryEmail(user)
  );
}

function serialize(row: typeof accessUsersTable.$inferSelect) {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId,
    email: row.email,
    name: row.name,
    role: row.role as AccessRole,
    status: row.status as AccessStatus,
    permissions: row.permissions ?? {},
    invitationId: row.invitationId,
    createdAt: row.createdAt,
  };
}

async function currentUserId(req: Request, res: Response) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Prisijungimas reikalingas." });
    return undefined;
  }
  return userId;
}

async function ensureAccessRecord(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const email = primaryEmail(user).toLowerCase();
  const name = displayName(user);

  let [record] = await db
    .select()
    .from(accessUsersTable)
    .where(eq(accessUsersTable.clerkUserId, userId))
    .limit(1);

  if (!record) {
    [record] = await db
      .select()
      .from(accessUsersTable)
      .where(eq(accessUsersTable.email, email))
      .limit(1);
  }

  if (record) {
    if (!record.clerkUserId || record.name !== name || record.email !== email) {
      [record] = await db
        .update(accessUsersTable)
        .set({ clerkUserId: userId, name, email })
        .where(eq(accessUsersTable.id, record.id))
        .returning();
    }
    return record;
  }

  const [owner] = await db
    .select({ id: accessUsersTable.id })
    .from(accessUsersTable)
    .where(eq(accessUsersTable.role, "owner"))
    .limit(1);

  [record] = await db
    .insert(accessUsersTable)
    .values({
      clerkUserId: userId,
      email,
      name,
      role: owner ? "employee" : "owner",
      status: owner ? "pending" : "approved",
      permissions: owner ? {} : ownerPermissions,
    })
    .returning();

  return record;
}

async function requireOwner(req: Request, res: Response) {
  const userId = await currentUserId(req, res);
  if (!userId) return undefined;

  const access = await ensureAccessRecord(userId);
  if (access.role !== "owner" || access.status !== "approved") {
    res.status(403).json({ error: "Tik savininkas gali valdyti paskyras." });
    return undefined;
  }
  return access;
}

router.get("/access/me", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;

  const access = await ensureAccessRecord(userId);
  res.json(GetAccessMeResponse.parse(serialize(access)));
});

router.get("/access/users", async (req, res): Promise<void> => {
  if (!(await requireOwner(req, res))) return;

  try {
    const users = await clerkClient.users.getUserList({
      limit: 100,
      orderBy: "-created_at",
    });
    await Promise.all(users.data.map((user) => ensureAccessRecord(user.id)));
    const rows = await db
      .select()
      .from(accessUsersTable)
      .orderBy(desc(accessUsersTable.createdAt));
    res.json(ListAccessUsersResponse.parse(rows.map(serialize)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to list access users");
    res.status(502).json({ error: "Nepavyko įkelti naudotojų sąrašo." });
  }
});

router.post("/access/users/invite", async (req, res): Promise<void> => {
  if (!(await requireOwner(req, res))) return;

  const parsed = InviteAccessUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Įvesk galiojantį el. pašto adresą." });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      notify: true,
    });
    const [record] = await db
      .insert(accessUsersTable)
      .values({
        email,
        name: email,
        role: "employee",
        status: "pending",
        permissions: {},
        invitationId: invitation.id,
      })
      .returning();
    res.status(201).json(InviteAccessUserResponse.parse(serialize(record)));
  } catch (error) {
    req.log.warn({ err: error }, "Failed to invite access user");
    res
      .status(400)
      .json({ error: "Kvietimo išsiųsti nepavyko. Galbūt šis el. paštas jau pakviestas." });
  }
});

router.patch("/access/users/:userId", async (req, res): Promise<void> => {
  if (!(await requireOwner(req, res))) return;

  const params = UpdateAccessUserParams.safeParse(req.params);
  const body = UpdateAccessUserBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Neteisingi prieigos duomenys." });
    return;
  }

  const [current] = await db
    .select()
    .from(accessUsersTable)
    .where(eq(accessUsersTable.id, params.data.userId))
    .limit(1);

  if (!current) {
    res.status(404).json({ error: "Naudotojas nerastas." });
    return;
  }
  if (current.role === "owner") {
    res.status(400).json({ error: "Savininko paskyros keisti negalima." });
    return;
  }
  if (body.data.status === "approved" && !current.clerkUserId) {
    res.status(400).json({ error: "Naudotojas turi pirmiausia užbaigti registraciją." });
    return;
  }

  const [updated] = await db
    .update(accessUsersTable)
    .set({
      status: body.data.status,
      permissions: body.data.permissions ?? current.permissions,
    })
    .where(and(eq(accessUsersTable.id, current.id), eq(accessUsersTable.role, "employee")))
    .returning();

  res.json(UpdateAccessUserResponse.parse(serialize(updated)));
});

export default router;