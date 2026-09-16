import { authOptions } from './src/backend/auth/authOptions';

const credentialsProvider = authOptions.providers[0] as any;

async function testLogin(email: string, password?: string, expectedRole?: string) {
  console.log(`\n--- Testing login for ${email} (${expectedRole}) ---`);
  try {
    const result = await credentialsProvider.options.authorize({ email, password, expectedRole }, { headers: {} });
    console.log(`Result for ${email}:`, result ? `Success! Welcome ${result.name} (${result.role})` : "Failed (returned null)");
  } catch (e: any) {
    console.log(`Result for ${email}: Error -`, e.message);
  }
}

async function run() {
  await testLogin('nishanthv041@gmail.com', 'Nishanth@2715', 'ADMIN');
  await testLogin('nishanthr.ad25@bitsathy.ac.in', 'Nishanth@2715', 'TEACHER');
  await testLogin('poorvika1527@gmail.com', 'poorvika@2715', 'PARENT');
  
  // Test role mismatch logic
  console.log("\n--- Testing role mismatch logic ---");
  await testLogin('poorvika1527@gmail.com', 'poorvika@2715', 'TEACHER'); // Should fail because expected role doesn't match
  
  process.exit(0);
}

run();
