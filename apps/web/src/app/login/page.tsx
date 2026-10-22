import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · HubSpot Site Auditor" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return <LoginForm linkError={typeof error === "string" ? error : undefined} />;
}
