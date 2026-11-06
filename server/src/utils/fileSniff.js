'use strict';
/**
 * 依据文件头（magic bytes）识别真实文件类型，防止伪造 MIME。
 * 覆盖反馈附件所需的图片与视频格式；无法识别返回 null。
 */

/** 嗅探出的类型 → 标准 MIME */
const TYPE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

const IMAGE_TYPES = new Set(['png', 'jpg', 'gif', 'webp']);
const VIDEO_TYPES = new Set(['mp4', 'webm', 'mov']);

function sniffFileType(buf) {
  if (!buf || buf.length < 12) return null;
  // 图片
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const head6 = buf.slice(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  // 视频
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm'; // EBML
  const brand = buf.slice(8, 12).toString('ascii');
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') {
    if (brand === 'qt  ') return 'mov';
    return 'mp4'; // isom / mp42 / avc1 / iso5 等
  }
  return null;
}

function mimeOfType(type) {
  return TYPE_MIME[type] || 'application/octet-stream';
}

module.exports = { sniffFileType, mimeOfType, IMAGE_TYPES, VIDEO_TYPES, TYPE_MIME };
