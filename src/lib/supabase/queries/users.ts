import type { User } from "@/types/user";
import { createClient } from "../client";

const supabase = createClient();

/**
 * Get current authenticated user.
 * When the caller already has the auth user id (e.g. from getSession()),
 * pass it via `knownUserId` to skip the extra auth round-trip.
 */
export async function getCurrentUser(
  knownUserId?: string
): Promise<User | null> {
  let userId = knownUserId;

  if (!userId) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    userId = authUser?.id;
  }

  if (!userId) {
    return null;
  }

  // Private columns (email, phone...) are not readable through the table;
  // the session user's full row comes from a SECURITY DEFINER RPC.
  const { data, error } = await supabase.rpc("get_my_profile").maybeSingle();

  if (error) {
    throw error;
  }

  return (data as User | null) ?? null;
}

/**
 * Get user by ID
 */
export async function getUser(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, profile_picture, country, is_student, is_tutor")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned
      return null;
    }
    throw error;
  }

  return data as User;
}

/**
 * Update user
 */
export async function updateUser(
  id: string,
  updates: Partial<User>
): Promise<User> {
  const { error } = await supabase
    .from("users")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw error;
  }

  // The updated row can only be read back through get_my_profile().
  const updated = await getCurrentUser(id);
  if (!updated) {
    throw new Error("Updated user not found.");
  }
  return updated;
}
