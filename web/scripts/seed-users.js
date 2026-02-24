const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

const SALT_ROUNDS = 12;

const adminUser = {
  username: 'admin',
  password: 'Admin123!'
};

const tenantUsers = [
  {
    username: '4301_somchai',
    password: 'Tenant123!',
    room_number: '4301',
    tenant_fname: 'Somchai',
    tenant_lname: 'Wong',
    tenant_email: 'tenant001@example.com',
    tenant_phone: '0800000001'
  },
  {
    username: '4302_suda',
    password: 'Tenant123!',
    room_number: '4302',
    tenant_fname: 'Suda',
    tenant_lname: 'Kanya',
    tenant_email: 'tenant002@example.com',
    tenant_phone: '0800000002'
  },
  {
    username: '4303_anan',
    password: 'Tenant123!',
    room_number: '4303',
    tenant_fname: 'Anan',
    tenant_lname: 'Chai',
    tenant_email: 'tenant003@example.com',
    tenant_phone: '0800000003'
  }
];

async function seedUsers() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fixmyroom'
  });

  try {
    await connection.beginTransaction();

    const adminHash = await bcrypt.hash(adminUser.password, SALT_ROUNDS);
    const [adminResult] = await connection.execute(
      'INSERT INTO accounts (role, username, password) VALUES (?, ?, ?)',
      ['admin', adminUser.username, adminHash]
    );
    const adminAccountId = adminResult.insertId;
    await connection.execute(
      'INSERT INTO admin (account_id) VALUES (?)',
      [adminAccountId]
    );

    for (const tenant of tenantUsers) {
      const tenantHash = await bcrypt.hash(tenant.password, SALT_ROUNDS);
      const [tenantResult] = await connection.execute(
        'INSERT INTO accounts (role, username, password) VALUES (?, ?, ?)',
        ['tenant', tenant.username, tenantHash]
      );
      const tenantAccountId = tenantResult.insertId;
      await connection.execute(
        'INSERT INTO tenants (account_id, room_number, tenant_fname, tenant_lname, tenant_email, tenant_phone) VALUES (?, ?, ?, ?, ?, ?)',
        [
          tenantAccountId,
          tenant.room_number,
          tenant.tenant_fname,
          tenant.tenant_lname,
          tenant.tenant_email,
          tenant.tenant_phone
        ]
      );
    }

    await connection.commit();
    console.log('Seed complete.');
    console.log('Admin:', adminUser.username, adminUser.password);
    tenantUsers.forEach((tenant) => {
      console.log('Tenant:', tenant.username, tenant.password, tenant.room_number);
    });
  } catch (error) {
    await connection.rollback();
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

seedUsers();
