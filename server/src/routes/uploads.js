import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { storeImage, deleteImage, assertImage } from '../services/storage.js';
import { badRequest } from '../lib/errors.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

router.post(
  '/',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    assertImage(req.file);
    const purpose = ['avatar', 'post', 'product', 'machinery', 'diagnosis'].includes(req.body?.purpose)
      ? req.body.purpose
      : 'general';
    const result = await storeImage(req.file, req.user.id, purpose);
    res.status(201).json({ upload: result });
  }),
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ok = deleteImage(Number(req.params.id), req.user.id);
    if (!ok) throw badRequest('文件不存在或无权删除');
    res.json({ ok: true });
  }),
);

export default router;
export { upload };
