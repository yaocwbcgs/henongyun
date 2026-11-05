import nodemailer from 'nodemailer';
import config from '../config.js';
import { logger } from '../lib/logger.js';
import { serviceUnavailable } from '../lib/errors.js';

let transporter;

export function mailerReady() {
  return config.integrations.email;
}

function getTransport() {
  if (!mailerReady()) {
    throw serviceUnavailable('邮件服务尚未配置，暂时无法发送验证码，请联系平台管理员', {
      missing: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
    });
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.pass },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, text, html }) {
  const info = await getTransport().sendMail({
    from: config.mail.from || config.mail.user,
    to,
    subject,
    text,
    html,
  });
  logger.info('mail.sent', { to, subject, messageId: info.messageId });
  return { messageId: info.messageId, accepted: info.accepted };
}

export async function sendVerificationCode(to, code, purpose) {
  const title = purpose === 'reset_password' ? '重置登录密码' : '验证邮箱地址';
  const html = `
  <div style="font-family:-apple-system,'PingFang SC',sans-serif;max-width:520px;margin:0 auto;color:#202922">
    <div style="border-bottom:2px solid #42523D;padding-bottom:12px;margin-bottom:24px">
      <strong style="font-size:18px;color:#42523D;letter-spacing:2px">禾农云</strong>
      <span style="color:#7A8078;font-size:13px;margin-left:8px">现代农业综合服务</span>
    </div>
    <p style="font-size:15px">你正在${title}，验证码如下：</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:600;color:#42523D;margin:18px 0">${code}</p>
    <p style="font-size:13px;color:#6B7269">验证码 10 分钟内有效，请勿转发给他人。如非本人操作请忽略此邮件。</p>
    <hr style="border:none;border-top:1px solid #E3E0D4;margin:28px 0" />
    <p style="font-size:12px;color:#8A9088">此邮件由禾农云系统自动发送，请勿直接回复。</p>
  </div>`;
  return sendMail({ to, subject: `【禾农云】${title}验证码`, text: `验证码：${code}，10 分钟内有效。`, html });
}

export async function verifyTransport() {
  if (!mailerReady()) return { ok: false, reason: '未配置 SMTP' };
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
