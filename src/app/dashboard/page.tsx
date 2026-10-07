import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Tonight's Book · Resy Rescue",
};

export default function DashboardPage() {
  return <Dashboard />;
}
