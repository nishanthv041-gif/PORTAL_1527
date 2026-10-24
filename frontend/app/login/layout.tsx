import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | School Portal",
  description: "Secure login for students, parents, teachers, and administrators.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
