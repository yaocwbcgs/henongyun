import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../config.js';
import { logger } from '../lib/logger.js';

/**
 * 病虫害识别适配器。
 * 当前实现：Plant.id v3 Identification API（真实第三方服务，需 PLANTID_API_KEY）。
 * 未配置密钥时明确返回 not_configured，绝不返回编造结果。
 */
export const SUPPORTED_CROPS = [
  { value: 'tomato', label: '番茄', scope: '由识别服务模型覆盖' },
  { value: 'cucumber', label: '黄瓜', scope: '由识别服务模型覆盖' },
  { value: 'pepper', label: '辣椒', scope: '由识别服务模型覆盖' },
  { value: 'apple', label: '苹果', scope: '由识别服务模型覆盖' },
  { value: 'grape', label: '葡萄', scope: '由识别服务模型覆盖' },
  { value: 'citrus', label: '柑橘', scope: '由识别服务模型覆盖' },
  { value: 'rice', label: '水稻', scope: '模型覆盖有限，结果需人工复核' },
  { value: 'wheat', label: '小麦', scope: '模型覆盖有限，结果需人工复核' },
];

export function recognitionStatus() {
  return {
    provider: config.recognition.provider,
    configured: config.integrations.recognition,
    supportedCrops: SUPPORTED_CROPS,
    note: config.integrations.recognition
      ? '识别请求将实时发送至 Plant.id 服务，返回的概率为该服务模型输出。'
      : '尚未配置识别服务密钥（PLANTID_API_KEY），提交后将转人工复核。',
  };
}

export async function identify({ imageAbsPath, crop }) {
  if (!config.integrations.recognition) {
    return { ok: false, code: 'not_configured', reason: '识别服务尚未接入' };
  }
  const buf = await fs.readFile(path.resolve(config.uploadDir, imageAbsPath));
  const base64 = buf.toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${config.recognition.baseUrl}/identification?details=description,treatment,url,common_names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': config.recognition.apiKey },
      body: JSON.stringify({ images: [base64], similar_images: true }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('recognition.http_error', { status: res.status, body: text.slice(0, 300) });
      return {
        ok: false,
        code: res.status === 401 || res.status === 403 ? 'auth_failed' : 'provider_error',
        reason: res.status === 401 || res.status === 403 ? '识别服务密钥无效' : `识别服务返回 ${res.status}`,
      };
    }
    const data = await res.json();
    return { ok: true, raw: data, normalized: normalize(data, crop) };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    logger.error('recognition.request_failed', { message: err.message, aborted });
    return { ok: false, code: aborted ? 'timeout' : 'network_error', reason: aborted ? '识别服务响应超时' : '识别服务网络异常' };
  } finally {
    clearTimeout(timer);
  }
}

function normalize(data, crop) {
  const result = data?.result || {};
  const disease = result.disease || {};
  const suggestions = Array.isArray(disease.suggestions) ? disease.suggestions : [];
  const isPlant = result.is_plant?.binary;
  const isHealthy = result.is_healthy?.binary;

  const candidates = suggestions.slice(0, 4).map((s) => ({
    name: s.name,
    probability: typeof s.probability === 'number' ? Number(s.probability.toFixed(4)) : null,
    description: s.details?.description?.value || s.details?.description || null,
    treatment: s.details?.treatment || null,
    commonNames: s.details?.common_names || null,
    url: s.details?.url || null,
    similarImages: (s.similar_images || []).slice(0, 3).map((i) => i.url).filter(Boolean),
  }));

  const uncertain =
    !isPlant ||
    (candidates.length > 0 && candidates[0].probability !== null && candidates[0].probability < 0.35) ||
    (candidates.length > 1 &&
      candidates[1].probability !== null &&
      candidates[0].probability !== null &&
      candidates[0].probability - candidates[1].probability < 0.08);

  return {
    crop,
    isPlant: Boolean(isPlant),
    isHealthy: Boolean(isHealthy),
    candidates,
    uncertain,
    modelVersion: data?.model_version || data?.version || null,
    source: 'Plant.id v3 Identification API',
    sourceUrl: 'https://plant.id',
    fetchedAt: new Date().toISOString(),
    rawScoreNote: '概率为识别服务模型输出，非平台测算；低概率或候选接近时建议人工复核。',
  };
}

export async function healthyCheck() {
  if (!config.integrations.recognition) return { ok: false, reason: '未配置 PLANTID_API_KEY' };
  try {
    const res = await fetch(`${config.recognition.baseUrl}/identification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': config.recognition.apiKey },
      body: JSON.stringify({ images: [] }),
      signal: AbortSignal.timeout(10_000),
    });
    // 400 说明鉴权通过但请求体不合法，可视为连通
    return { ok: res.status === 400 || res.ok, status: res.status };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
