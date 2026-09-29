# W2B 交付包 HASH-MANIFEST

> 机器生成（sha256 over file bytes）。用途：交付包完整性核对 —— 任一份文件被改动，
> 其 sha256 与本表不符即为篡改/漂移。本文件本身不进 evidence 目录，避免在
> evidence-verify 的 orphan 扫描里产生噪声（orphan 只扫 .txt）。

| 项 | 值 |
|---|---|
| 实现 commit | `8eed60092affac49939ef49ada64cd832c9d431e` |
| 证据 commit | `0e868403f6efd57db5649cfd67864e0891685969` |
| matrix commit | `8eed60092affac49939ef49ada64cd832c9d431e`（== 实现 commit，== 生成证据时的 HEAD）|
| matrix summary | PASS 12 / FAIL 0 / total 12 |
| verify | Evidence Chain CLOSED 97/97 |
| generatedAt | 2026-09-29T16:35:56.260Z |

## 文件清单

| File | Bytes | SHA256 |
|------|-------|--------|
| `docs/audit-package/_generated/evidence/W2B/W2B-BUILD-20260930-003202-R01.txt` | 1753 | `1174c238911cb1d9a2d29c984b897afd6fe342bd1c90e34d2a7563b78019df86` |
| `docs/audit-package/_generated/evidence/W2B/W2B-DRYRUN-REAL-20260930-003252-R01.txt` | 1409 | `7e13d084ce5d1d1091e49d175023fb1ea7d8676e91729a2610e28ea2a34a1c97` |
| `docs/audit-package/_generated/evidence/W2B/W2B-GATE-LEARNING-BOUNDARY-20260930-003202-R01.txt` | 684 | `cc92ad14f1e80a7709292d9aad7b45cf0c1df3061f50e6ca6ac0b3f041868f24` |
| `docs/audit-package/_generated/evidence/W2B/W2B-LINT-20260930-003158-R01.txt` | 13383 | `a4131315e38e15f8bdacc2eb566ef3eb538df0471b0785403433c5e8365ca62c` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TEST-E2E-20260930-003257-R01.txt` | 10984 | `7bc451b0adeaa7703f3deefc7d8cfcb9f9ba33d34f654252a26bf5612d8be5e2` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TEST-LEARNING-BOUNDARY-WIRING-20260930-003225-R01.txt` | 2447 | `615635b79a58c63c9a0bf777fe4341c49d264c52952f95d0488dac87b8b196d4` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TEST-LEARNING-INSIGHTS-20260930-003241-R01.txt` | 1630 | `2f30a521638059f7457e5c0e5fef2d614a742fa363753b98ff470aa89451b712` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TEST-LEARNING-SERVICE-20260930-003235-R01.txt` | 1751 | `8aeb125948a3f0bdd6e813eed22c23eeea156a92184e3ce4ffd6c2ad932cf140` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TEST-LEARNING-STORAGE-20260930-003230-R01.txt` | 9460 | `cb522c92e1c80cf66ba9b0813f395500a7ec84b30d7434f66f447f2b15c13a71` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TEST-MIGRATION-GUARDS-20260930-003247-R01.txt` | 3493 | `d422d73eaacf83096a14898e53d97e6300436a3c68d4554f1a6f0f6d08d65f5a` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TEST-PERSISTENCE-BOUNDARY-20260930-003219-R01.txt` | 2820 | `f34348983a0ac3775a8dd569a334458ef34aa220bbe9564e9e7e66b5a3d02c7d` |
| `docs/audit-package/_generated/evidence/W2B/W2B-TSC-20260930-003148-R01.txt` | 213 | `3ae3ca43ff77f8a3a7525fd292dcec96ad2dea7d8cfb7460791519387d0a3048` |
| `docs/audit-package/_generated/evidence/W2B/evidence-matrix.json` | 7067 | `6398f0b38ecba39c6ab5f6373fcc2e59a463de76205ff00a4a3a6511258e927d` |
| `docs/audit-package/_generated/evidence/W2B/evidence-matrix.md` | 2084 | `8092a7b12383bebff7f8a6f2417f4502e33d83a042500bf8a5864fbe53e93e36` |
| `docs/audit-package/W2B-VERIFICATION-MAP.md` | 15130 | `0842b42f10640dfd4e8b00df5f953400d6d2041ae64541f72c5ea45125630706` |

共 15 份文件。