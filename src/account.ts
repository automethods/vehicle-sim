import type { IncomingMessage, ServerResponse } from "node:http";

export const accountHome = "https://automethods.com/";
const sessionEndpoint = new URL("api/session", accountHome);

export async function signedIn(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  const cookies = request.headers.cookie?.split(";").map((part) => part.trim())
    .filter((part) => /^am_(?:access|refresh)=/.test(part)).join("; ");
  if (!cookies) return false;
  try {
    const session = await fetch(sessionEndpoint, {
      headers: { Cookie: cookies }, redirect: "error", signal: AbortSignal.timeout(7_000),
    });
    if (!session.ok) return false;
    const data = await session.json();
    const refreshed = session.headers.getSetCookie();
    if (refreshed.length) response.setHeader("Set-Cookie", refreshed);
    return data.configured === true && typeof data.user?.id === "string" && data.user.id.length > 0;
  } catch {
    return false;
  }
}
