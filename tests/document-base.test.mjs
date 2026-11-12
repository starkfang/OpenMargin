import test from 'node:test';
import assert from 'node:assert/strict';
import { documentBaseUrl } from '../src/documentBase.mjs';

test('document asset base supports POSIX paths and escaped special characters', () => {
  assert.equal(documentBaseUrl('/Users/测试 目录/报告#1/介绍.md'), 'file:///Users/%E6%B5%8B%E8%AF%95%20%E7%9B%AE%E5%BD%95/%E6%8A%A5%E5%91%8A%231/');
  assert.equal(documentBaseUrl('/readme.md'), 'file:///');
  assert.equal(documentBaseUrl('/tmp/a\\b/intro.md'), 'file:///tmp/a%5Cb/');
});
test('document asset base supports Windows drive paths and root directories', () => {
  assert.equal(documentBaseUrl('C:\\Users\\测试 目录\\报告#1\\介绍.md'), 'file:///C:/Users/%E6%B5%8B%E8%AF%95%20%E7%9B%AE%E5%BD%95/%E6%8A%A5%E5%91%8A%231/');
  assert.equal(documentBaseUrl('C:\\readme.md'), 'file:///C:/');
  assert.equal(documentBaseUrl('D:/Users/A B/readme.md'), 'file:///D:/Users/A%20B/');
});
test('document asset base supports Windows network shares', () => {
  assert.equal(documentBaseUrl('\\\\server\\shared\\项目 文档\\介绍.md'), 'file://server/shared/%E9%A1%B9%E7%9B%AE%20%E6%96%87%E6%A1%A3/');
  assert.equal(documentBaseUrl('\\\\server\\shared\\readme.md'), 'file://server/shared/');
});
