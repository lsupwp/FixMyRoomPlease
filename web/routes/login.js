const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

// Login page route
router.get('/login', (req, res) => {
  res.render('login', { title: 'Login', error: null });
});

router.post('/login', async (req, res)=>{
  const { username, password } = req.body;

  const strippedUsername = username.trim();
  const strippedPassword = password.trim();

  if (!strippedUsername || !strippedPassword) {
    return res.render('login', { 
      title: 'Login',
      error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'
    });
  }

  try {
    const [rows] = await pool.execute(
      `
        SELECT accounts.account_id, accounts.password, accounts.role, tenants.room_number
        FROM accounts
        LEFT JOIN tenants ON tenants.account_id = accounts.account_id
        WHERE accounts.username = ? AND accounts.is_deleted = FALSE
        LIMIT 1
      `,
      [strippedUsername]
    );

    if (rows.length === 0) {
      return res.render('login', { 
        title: 'Login',
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    const account = rows[0];
    const isMatch = await bcrypt.compare(strippedPassword, account.password);

    if (!isMatch) {
      return res.render('login', { 
        title: 'Login',
        error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    req.session = {
      account_id: account.account_id,
      username: strippedUsername,
      room_number: account.room_number || null,
      role: account.role
    };

    // Redirect based on role
    if (account.role === 'admin') {
      return res.redirect('/admin/problems');
    }
    
    return res.redirect('/');
  } catch (error) {
    return res.render('login', { 
      title: 'Login',
      error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
    });
  }
})

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;