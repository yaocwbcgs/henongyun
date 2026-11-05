import { loadConfig } from '../config.js';
import { initDb } from './index.js';
import { seed } from './seed.js';

loadConfig();
initDb();
const result = seed();
if (result.skipped) console.log('已存在用户数据，跳过种子写入。');
else console.log('演示数据写入完成：', result.users.map((u) => `${u.email}`).join(', '));
