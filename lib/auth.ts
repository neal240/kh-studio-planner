const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

async function authRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/${path}`, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("暂时无法连接登录服务，请稍后重试");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || "登录验证失败");
  return data as T;
}

export async function sendEmailCode(email: string, shouldCreateUser = true) {
  await authRequest("otp", { email, create_user: shouldCreateUser });
}

export async function verifyEmailCode(email: string, code: string) {
  const data = await authRequest<{ access_token?: string }>("verify", { email, token: code.trim(), type: "email" });
  if (!data.access_token) throw new Error("验证码无效或已过期");
  return data.access_token;
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
