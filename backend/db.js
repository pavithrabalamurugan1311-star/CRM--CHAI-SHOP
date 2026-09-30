const mysql = require('mysql2/promise');

// Change user/password if your MySQL setup is different
module.exports = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',          // <-- put your MySQL password here
  database: 'crm_chain_shop'
});
