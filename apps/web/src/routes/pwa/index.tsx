import { createFileRoute } from "@tanstack/solid-router";
import HomeScreen from "@/components/home/HomeScreen";

export const Route = createFileRoute("/pwa/")({ component: HomeScreen });
