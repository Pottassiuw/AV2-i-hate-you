import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createDatabase(connectionString: string) {
  const schema =
    new URL(connectionString).searchParams.get("schema") ?? "public";
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema }),
  });
}
