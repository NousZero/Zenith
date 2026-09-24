// Failures that come from the person's account with a tool or provider, not from Zenith or the
// request: no quota or credit left, rate-limited, unpaid, signed out, or no key. Another
// assistant can usually carry on, so the pane offers one; the smoke suite skips on these.
const ACCOUNT_PROBLEM =
  /authori[sz](?:ed|ation)|credential|quota|rate[ _-]?limit|usage limit|limit reached|hit your limit|credit|billing|payment required|subscription|sign in|log ?in|logged out|authenticat|api[ _-]?key|no longer supported/i;

export function isAccountProblem(message: string): boolean {
  return ACCOUNT_PROBLEM.test(message);
}
