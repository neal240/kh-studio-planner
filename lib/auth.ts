import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
export const authClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });

export async function sendEmailCode(email: string, shouldCreateUser = true) {
  const { error } = await authClient.auth.signInWithOtp({ email, options: { shouldCreateUser } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string) {
  const { data, error } = await authClient.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw error;
  if (!data.session) throw new Error("验证码无效或已过期");
  return data.session.access_token;
}

export async function joinWithVerifiedEmail(accessToken: string, inviteCode: string, name: string) {
  const response = await fetch(`${url}/rest/v1/rpc/join_with_verified_email`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code: inviteCode, display_name: name }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "加入工作室失败");
  return data as { session_token: string; member_name: string; role: string };
}

export async function loginWithVerifiedEmail(accessToken: string) {
  return joinWithVerifiedEmail(accessToken, "", "");
}
