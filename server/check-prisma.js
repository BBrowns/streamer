import { prisma } from "./src/prisma/client.js";

async function main() {
  console.log(
    "Prisma keys:",
    Object.keys(prisma).filter((k) => !k.startsWith("$")),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
