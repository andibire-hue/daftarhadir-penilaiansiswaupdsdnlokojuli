# Firestore Security Specification (Payload-First TDD)

## 1. Data Invariants
1. Every document under `/users/{userId}/...` belongs exclusively to the verified Google account whose `request.auth.uid == userId` and `request.auth.token.email_verified == true`.
2. Every document MUST store `ownerId == request.auth.uid`, and `ownerId` + `createdAt` are strictly immutable after creation.
3. All `createdAt` and `updatedAt` timestamps MUST equal `request.time` (server timestamp).
4. All document IDs (`userId`, `settingId`, `studentId`, `sessionId`, `metaId`, `classKey`) must satisfy `^[a-zA-Z0-9_\\-]+$` and length `<= 128`.
5. String, number, and list fields have strict type and size limits; unknown/shadow fields are rejected via `keys().hasAll(...)`, `keys().hasOnly(...)`, and `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read/write**: `request.auth == null` reading `/users/u1/students/s1`.
2. **Unverified email write**: `request.auth.token.email_verified == false` writing `/users/u1/students/s1`.
3. **Cross-user access (IDOR)**: `u2` reading or writing `/users/u1/students/s1`.
4. **Owner spoofing on create**: `u1` creating `/users/u1/students/s1` with `ownerId: "u2"`.
5. **Shadow field injection on create**: `u1` creating `/users/u1/students/s1` with extra `isAdmin: true`.
6. **Shadow field injection on update**: `u1` updating `/users/u1/students/s1` with `affectedKeys` containing `role: "admin"`.
7. **Owner mutation on update**: `u1` changing `ownerId` from `u1` to `u2`.
8. **Immutable createdAt tampering**: `u1` changing `createdAt` during update.
9. **Client-forged timestamp**: `u1` passing a hardcoded string/date instead of `request.time` for `createdAt` or `updatedAt`.
10. **ID poisoning**: `u1` targeting a 200-char or slash/dot-containing document ID like `bad.id$1`.
11. **Out-of-range grades / KKTP**: `u1` writing `nilaiAkhir: 999` or `kktp: -5`.
12. **Blanket list scraping**: `u2` querying `collection(db, 'users/u1/students')` without matching `ownerId == request.auth.uid`.
