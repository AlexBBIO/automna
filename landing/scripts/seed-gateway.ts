/**
 * Seed gateway credentials for a user
 * Run with: npx ts-node scripts/seed-gateway.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      clerkId: true,
      email: true,
      gatewayUrl: true,
      gatewayToken: true,
    },
  });
  
  console.log('Current users:');
  for (const user of users) {
    console.log(`  ${user.email} (${user.clerkId})`);
    console.log(`    gatewayUrl: ${user.gatewayUrl || 'not set'}`);
    console.log(`    gatewayToken: ${user.gatewayToken ? '***' : 'not set'}`);
  }
  
  // Find Alex's user (by email pattern)
  const alexUser = users.find(u => u.email.includes('alex') || u.email.includes('beyondbaseline'));
  
  if (!alexUser) {
    console.log('\nNo user found matching Alex. Available emails:');
    users.forEach(u => console.log(`  - ${u.email}`));
    return;
  }
  
  console.log(`\nUpdating user: ${alexUser.email}`);
  
  // Update with test gateway credentials
  await prisma.user.update({
    where: { id: alexUser.id },
    data: {
      gatewayUrl: 'wss://test.automna.ai',
      gatewayToken: 'test123',
    },
  });
  
  console.log('✅ Gateway credentials set!');
  console.log('   gatewayUrl: wss://test.automna.ai');
  console.log('   gatewayToken: test123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
