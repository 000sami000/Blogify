import User from "../model/User.js";

const getAdminEmails = () =>
  Array.from(
    new Set(
      String(process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );

export const backfillUserDefaults = async () => {
  const [
    roleResult,
    bannedResult,
    activeResult,
    profileVisitsResult,
    starsCountResult,
    authProviderResult,
  ] = await Promise.all([
    User.updateMany(
      { role: { $exists: false } },
      { $set: { role: "user" } }
    ),
    User.updateMany(
      { isBanned: { $exists: false } },
      { $set: { isBanned: false } }
    ),
    User.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    ),
    User.updateMany(
      { profileVisits: { $exists: false } },
      { $set: { profileVisits: 0 } }
    ),
    User.updateMany(
      { starsCount: { $exists: false } },
      { $set: { starsCount: 0 } }
    ),
    User.updateMany(
      { authProvider: { $exists: false } },
      { $set: { authProvider: "google" } }
    ),
  ]);

  const adminEmails = getAdminEmails();
  let adminPromotions = 0;

  if (adminEmails.length > 0) {
    const adminRoleResult = await User.updateMany(
      { email: { $in: adminEmails } },
      { $set: { role: "admin" } }
    );
    adminPromotions =
      adminRoleResult.modifiedCount ?? adminRoleResult.matchedCount ?? 0;
  }

  console.log(
    "User defaults backfilled",
    JSON.stringify({
      roleUpdated: roleResult.modifiedCount ?? roleResult.matchedCount ?? 0,
      isBannedUpdated:
        bannedResult.modifiedCount ?? bannedResult.matchedCount ?? 0,
      isActiveUpdated:
        activeResult.modifiedCount ?? activeResult.matchedCount ?? 0,
      profileVisitsUpdated:
        profileVisitsResult.modifiedCount ?? profileVisitsResult.matchedCount ?? 0,
      starsCountUpdated:
        starsCountResult.modifiedCount ?? starsCountResult.matchedCount ?? 0,
      authProviderUpdated:
        authProviderResult.modifiedCount ?? authProviderResult.matchedCount ?? 0,
      adminPromotions,
    })
  );
};
