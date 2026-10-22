import { AuthForm, type AuthMode } from "./login-form";

export const metadata = { title: "Sign in · HubSpot Site Auditor" };

const MODES: AuthMode[] = ["signin", "forgot"];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { mode, error } = await searchParams;
  const authMode = MODES.includes(mode as AuthMode) ? (mode as AuthMode) : "signin";
  const notice = typeof error === "string" ? `That link didn't work (${error}). Try again.` : undefined;

  // key: switching modes resets the form state.
  return <AuthForm key={authMode} mode={authMode} notice={notice} />;
}
