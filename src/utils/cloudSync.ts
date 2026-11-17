import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ClassAttendanceSession,
  ClassCurriculumPackage,
  ClassGrade,
  CurriculumStoreState,
  SchoolInfo,
  StudentGrade,
} from '../types';
import {
  loadClassAttendance,
  loadClassGrades,
  loadSchoolInfo,
  saveClassAttendance,
  saveClassGrades,
  saveSchoolInfo,
} from './storage';
import { loadCurriculumStore, saveCurriculumStore } from './curriculumStorage';
import { ALL_CURRICULUM_CLASSES } from './curriculumGenerator';

const ALL_CLASSES: ClassGrade[] = [
  'Kelas 1',
  'Kelas 2',
  'Kelas 3',
  'Kelas 4',
  'Kelas 5',
  'Kelas 6',
];

export function sanitizeDocId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return cleaned || `doc_${Date.now()}`;
}

export function classToKey(kelas: ClassGrade): string {
  return kelas.toLowerCase().replace(/\s+/g, '_'); // e.g. 'kelas_1'
}

export function studentDocId(kelas: ClassGrade, localId: string): string {
  return sanitizeDocId(`${classToKey(kelas)}__${localId}`);
}

export function attendanceDocId(kelas: ClassGrade, date: string): string {
  return sanitizeDocId(`${classToKey(kelas)}__${date}`);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    });
    return out as T;
  }
  return value;
}

function clampScore(val: number): number {
  const n = Number(val);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function buildSchoolPayload(uid: string, info: SchoolInfo) {
  return {
    ownerId: uid,
    schoolName: (info.schoolName || 'UPTD SD NEGERI LOKOJULI').slice(0, 150),
    subject: (info.subject || 'PJOK').slice(0, 150),
    teacherName: (info.teacherName || 'Guru PJOK').slice(0, 150),
    teacherNip: String(info.teacherNip || '').slice(0, 60),
    principalName: String(info.principalName || '').slice(0, 150),
    principalNip: String(info.principalNip || '').slice(0, 60),
    academicYear: (info.academicYear || '2026/2027').slice(0, 40),
    semester: info.semester === 'Genap' ? 'Genap' : 'Ganjil',
    kktp: clampScore(info.kktp),
  };
}

function buildStudentPayload(uid: string, kelas: ClassGrade, s: StudentGrade) {
  return {
    ownerId: uid,
    localId: sanitizeDocId(s.id),
    kelas,
    nis: String(s.nis || '').slice(0, 40),
    name: (s.name || 'Siswa').slice(0, 150),
    gender: s.gender === 'P' ? 'P' : 'L',
    dailyScore: clampScore(s.dailyScore),
    practicalScore: clampScore(s.practicalScore),
    midtermScore: clampScore(s.midtermScore),
    finalScore: clampScore(s.finalScore),
    finalReportScore: clampScore(s.finalReportScore),
    predicate: ['A', 'B', 'C', 'D'].includes(s.predicate) ? s.predicate : 'C',
    status: s.status === 'Remedial' ? 'Remedial' : 'Tuntas',
    notes: String(s.notes || '').slice(0, 500),
    heightCm: Math.max(0, Math.min(300, Number(s.heightCm) || 0)),
    weightKg: Math.max(0, Math.min(300, Number(s.weightKg) || 0)),
    favoriteSport: String(s.favoriteSport || '').slice(0, 100),
    isSelfRegistered: Boolean(s.isSelfRegistered),
    clientUpdatedAt: String(s.updatedAt || new Date().toISOString()).slice(0, 60),
  };
}

function buildAttendancePayload(
  uid: string,
  kelas: ClassGrade,
  session: ClassAttendanceSession
) {
  const sanitizedRecords: Record<string, { status: string; note?: string }> = {};
  const entries = Object.entries(session.records || {}).slice(0, 100);
  entries.forEach(([k, v]) => {
    sanitizedRecords[sanitizeDocId(k)] = stripUndefined({
      status: v.status || 'H',
      ...(v.note ? { note: String(v.note).slice(0, 200) } : {}),
    });
  });

  return {
    ownerId: uid,
    kelas,
    date: String(session.date || '').slice(0, 30),
    topic: String(session.topic || '').slice(0, 200),
    records: sanitizedRecords,
    clientUpdatedAt: String(session.updatedAt || new Date().toISOString()).slice(0, 60),
  };
}

function buildCurriculumMetaPayload(uid: string, store: CurriculumStoreState) {
  return {
    ownerId: uid,
    sourceFileName: String(store.sourceFileName || '').slice(0, 200),
    importedAt: String(store.importedAt || '').slice(0, 60),
    detectedSheets: (store.detectedSheets || []).slice(0, 40).map((s) => String(s)),
  };
}

function buildCurriculumClassPayload(uid: string, pkg: ClassCurriculumPackage) {
  return stripUndefined({
    ownerId: uid,
    kelas: pkg.kelas,
    fase: pkg.fase,
    identity: { ...pkg.identity },
    cpSourceSheet: String(pkg.cpSourceSheet || '').slice(0, 120),
    atpSourceSheet: String(pkg.atpSourceSheet || '').slice(0, 120),
    cpRows: (pkg.cpRows || []).slice(0, 30),
    atpRows: (pkg.atpRows || []).slice(0, 60),
    protaRows: (pkg.protaRows || []).slice(0, 60),
    promesRows: (pkg.promesRows || []).slice(0, 60),
    materials: (pkg.materials || []).slice(0, 60),
    modulAjarList: (pkg.modulAjarList || []).slice(0, 60),
    assessmentPackage: { ...pkg.assessmentPackage },
    totalJpSemester1: Math.max(0, Math.min(500, Number(pkg.totalJpSemester1) || 0)),
    packageUpdatedAt: String(pkg.updatedAt || new Date().toISOString()).slice(0, 60),
  });
}

export async function syncSchoolInfoToCloud(
  uid: string,
  info: SchoolInfo,
  existsInCloud: boolean
): Promise<void> {
  const path = `users/${uid}/settings/schoolInfo`;
  const ref = doc(db, 'users', uid, 'settings', 'schoolInfo');
  const payload = buildSchoolPayload(uid, info);
  try {
    if (existsInCloud) {
      const { ownerId: _ignore, ...updatable } = payload;
      await updateDoc(ref, {
        ...updatable,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, existsInCloud ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function syncClassStudentsToCloud(
  uid: string,
  kelas: ClassGrade,
  students: StudentGrade[],
  knownCloudIds: Set<string>
): Promise<void> {
  const prefix = `${classToKey(kelas)}__`;
  const targetDocIds = new Set(students.map((s) => studentDocId(kelas, s.id)));
  const path = `users/${uid}/students`;

  try {
    // Delete students removed from this class
    for (const existingId of Array.from(knownCloudIds)) {
      if (existingId.startsWith(prefix) && !targetDocIds.has(existingId)) {
        await deleteDoc(doc(db, 'users', uid, 'students', existingId));
        knownCloudIds.delete(existingId);
      }
    }

    // Batch creates/updates (max 400 per batch)
    for (let i = 0; i < students.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = students.slice(i, i + 400);
      chunk.forEach((student) => {
        const docId = studentDocId(kelas, student.id);
        const ref = doc(db, 'users', uid, 'students', docId);
        const payload = buildStudentPayload(uid, kelas, student);
        if (knownCloudIds.has(docId)) {
          const { ownerId: _ignore, ...updatable } = payload;
          batch.update(ref, {
            ...updatable,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          knownCloudIds.add(docId);
        }
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncClassAttendanceToCloud(
  uid: string,
  kelas: ClassGrade,
  sessions: ClassAttendanceSession[],
  knownCloudIds: Set<string>
): Promise<void> {
  const prefix = `${classToKey(kelas)}__`;
  const targetDocIds = new Set(sessions.map((s) => attendanceDocId(kelas, s.date)));
  const path = `users/${uid}/attendanceSessions`;

  try {
    for (const existingId of Array.from(knownCloudIds)) {
      if (existingId.startsWith(prefix) && !targetDocIds.has(existingId)) {
        await deleteDoc(doc(db, 'users', uid, 'attendanceSessions', existingId));
        knownCloudIds.delete(existingId);
      }
    }

    for (const session of sessions) {
      const docId = attendanceDocId(kelas, session.date);
      const ref = doc(db, 'users', uid, 'attendanceSessions', docId);
      const payload = buildAttendancePayload(uid, kelas, session);
      if (knownCloudIds.has(docId)) {
        const { ownerId: _ignore, ...updatable } = payload;
        await updateDoc(ref, {
          ...updatable,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        knownCloudIds.add(docId);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncCurriculumStoreToCloud(
  uid: string,
  store: CurriculumStoreState,
  knownClassKeys: Set<string>,
  hasMetaInCloud: boolean
): Promise<void> {
  const metaPath = `users/${uid}/curriculumMeta/active`;
  try {
    const metaRef = doc(db, 'users', uid, 'curriculumMeta', 'active');
    const metaPayload = buildCurriculumMetaPayload(uid, store);
    if (hasMetaInCloud) {
      const { ownerId: _ignore, ...updatable } = metaPayload;
      await updateDoc(metaRef, {
        ...updatable,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(metaRef, {
        ...metaPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      hasMetaInCloud ? OperationType.UPDATE : OperationType.CREATE,
      metaPath
    );
  }

  for (const cls of ALL_CURRICULUM_CLASSES) {
    const pkg = store.classes[cls];
    if (!pkg) continue;
    const key = classToKey(cls);
    const classPath = `users/${uid}/curriculumClasses/${key}`;
    try {
      const ref = doc(db, 'users', uid, 'curriculumClasses', key);
      const payload = buildCurriculumClassPayload(uid, pkg);
      if (knownClassKeys.has(key)) {
        const { ownerId: _ignore, ...updatable } = payload;
        await updateDoc(ref, {
          ...updatable,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        knownClassKeys.add(key);
      }
    } catch (error) {
      handleFirestoreError(
        error,
        knownClassKeys.has(key) ? OperationType.UPDATE : OperationType.CREATE,
        classPath
      );
    }
  }
}

export interface CloudSnapshotCallbacks {
  onSchoolInfo: (info: SchoolInfo) => void;
  onStudentsByClass: (byClass: Record<ClassGrade, StudentGrade[]>, cloudIds: Set<string>) => void;
  onAttendanceByClass: (
    byClass: Record<ClassGrade, ClassAttendanceSession[]>,
    cloudIds: Set<string>
  ) => void;
  onCurriculumStore: (
    store: CurriculumStoreState,
    cloudClassKeys: Set<string>,
    hasMeta: boolean
  ) => void;
  onMetaStatus: (hasSettings: boolean, hasMeta: boolean) => void;
}

/**
 * Push local device data to cloud ONLY for slices that are still empty in cloud,
 * ensuring zero data loss on first login while keeping cloud data authoritative across devices.
 */
export async function bootstrapCloudFromLocalIfEmpty(uid: string): Promise<void> {
  const settingsQ = query(collection(db, 'users', uid, 'settings'), where('ownerId', '==', uid));
  const studentsQ = query(collection(db, 'users', uid, 'students'), where('ownerId', '==', uid));
  const attQ = query(collection(db, 'users', uid, 'attendanceSessions'), where('ownerId', '==', uid));
  const currMetaQ = query(collection(db, 'users', uid, 'curriculumMeta'), where('ownerId', '==', uid));
  const currClsQ = query(collection(db, 'users', uid, 'curriculumClasses'), where('ownerId', '==', uid));

  let settingsSnap, studentsSnap, attSnap, currMetaSnap, currClsSnap;

  try {
    [settingsSnap, studentsSnap, attSnap, currMetaSnap, currClsSnap] = await Promise.all([
      getDocs(settingsQ),
      getDocs(studentsQ),
      getDocs(attQ),
      getDocs(currMetaQ),
      getDocs(currClsQ),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}`);
  }

  // 1. Settings
  if (settingsSnap.empty) {
    const localInfo = loadSchoolInfo();
    await syncSchoolInfoToCloud(uid, localInfo, false);
  }

  // 2. Students (per class check or empty collection check)
  if (studentsSnap.empty) {
    const emptySet = new Set<string>();
    for (const cls of ALL_CLASSES) {
      const localStudents = loadClassGrades(cls);
      if (localStudents.length > 0) {
        await syncClassStudentsToCloud(uid, cls, localStudents, emptySet);
      }
    }
  }

  // 3. Attendance
  if (attSnap.empty) {
    const emptySet = new Set<string>();
    for (const cls of ALL_CLASSES) {
      const localSessions = loadClassAttendance(cls);
      if (localSessions.length > 0) {
        await syncClassAttendanceToCloud(uid, cls, localSessions, emptySet);
      }
    }
  }

  // 4. Curriculum
  if (currMetaSnap.empty && currClsSnap.empty) {
    const localCurr = loadCurriculumStore();
    await syncCurriculumStoreToCloud(uid, localCurr, new Set<string>(), false);
  }
}

export function subscribeUserCloudData(
  uid: string,
  callbacks: CloudSnapshotCallbacks
): () => void {
  const unsubscribes: Array<() => void> = [];

  let latestMeta: {
    sourceFileName: string | null;
    importedAt: string | null;
    detectedSheets: string[];
  } = {
    sourceFileName: null,
    importedAt: null,
    detectedSheets: [],
  };
  let hasMeta = false;
  let latestCurriculumClasses: Record<ClassGrade, ClassCurriculumPackage> =
    loadCurriculumStore().classes;
  const knownCurriculumKeys = new Set<string>();

  const emitCurriculum = () => {
    const nextStore: CurriculumStoreState = {
      sourceFileName: latestMeta.sourceFileName,
      importedAt: latestMeta.importedAt,
      detectedSheets: latestMeta.detectedSheets,
      classes: latestCurriculumClasses,
    };
    saveCurriculumStore(nextStore);
    callbacks.onCurriculumStore(nextStore, knownCurriculumKeys, hasMeta);
  };

  // 1. Settings listener
  const settingsQ = query(collection(db, 'users', uid, 'settings'), where('ownerId', '==', uid));
  unsubscribes.push(
    onSnapshot(
      settingsQ,
      (snap) => {
        const hasSettings = !snap.empty;
        callbacks.onMetaStatus(hasSettings, hasMeta);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const info: SchoolInfo = {
            schoolName: String(data.schoolName || 'UPTD SD NEGERI LOKOJULI'),
            subject: String(data.subject || 'PJOK'),
            teacherName: String(data.teacherName || ''),
            teacherNip: String(data.teacherNip || ''),
            principalName: String(data.principalName || ''),
            principalNip: String(data.principalNip || ''),
            academicYear: String(data.academicYear || '2026/2027'),
            semester: data.semester === 'Genap' ? 'Genap' : 'Ganjil',
            kktp: Number(data.kktp) || 70,
          };
          saveSchoolInfo(info);
          callbacks.onSchoolInfo(info);
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/settings`)
    )
  );

  // 2. Students listener
  const studentsQ = query(collection(db, 'users', uid, 'students'), where('ownerId', '==', uid));
  unsubscribes.push(
    onSnapshot(
      studentsQ,
      (snap) => {
        const byClass: Record<ClassGrade, StudentGrade[]> = {
          'Kelas 1': [],
          'Kelas 2': [],
          'Kelas 3': [],
          'Kelas 4': [],
          'Kelas 5': [],
          'Kelas 6': [],
        };
        const cloudIds = new Set<string>();

        snap.docs.forEach((docSnap) => {
          cloudIds.add(docSnap.id);
          const d = docSnap.data();
          const cls = d.kelas as ClassGrade;
          if (!byClass[cls]) return;
          byClass[cls].push({
            id: String(d.localId || docSnap.id),
            nis: String(d.nis || ''),
            name: String(d.name || ''),
            gender: d.gender === 'P' ? 'P' : 'L',
            dailyScore: Number(d.dailyScore) || 0,
            practicalScore: Number(d.practicalScore) || 0,
            midtermScore: Number(d.midtermScore) || 0,
            finalScore: Number(d.finalScore) || 0,
            finalReportScore: Number(d.finalReportScore) || 0,
            predicate: (['A', 'B', 'C', 'D'].includes(d.predicate)
              ? d.predicate
              : 'C') as StudentGrade['predicate'],
            status: d.status === 'Remedial' ? 'Remedial' : 'Tuntas',
            notes: d.notes ? String(d.notes) : undefined,
            heightCm: Number(d.heightCm) > 0 ? Number(d.heightCm) : undefined,
            weightKg: Number(d.weightKg) > 0 ? Number(d.weightKg) : undefined,
            favoriteSport: d.favoriteSport ? String(d.favoriteSport) : undefined,
            isSelfRegistered: Boolean(d.isSelfRegistered),
            updatedAt: String(d.clientUpdatedAt || new Date().toISOString()),
          });
        });

        ALL_CLASSES.forEach((cls) => {
          byClass[cls].sort((a, b) => a.name.localeCompare(b.name, 'id'));
          saveClassGrades(cls, byClass[cls]);
        });
        callbacks.onStudentsByClass(byClass, cloudIds);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/students`)
    )
  );

  // 3. Attendance listener
  const attQ = query(
    collection(db, 'users', uid, 'attendanceSessions'),
    where('ownerId', '==', uid)
  );
  unsubscribes.push(
    onSnapshot(
      attQ,
      (snap) => {
        const byClass: Record<ClassGrade, ClassAttendanceSession[]> = {
          'Kelas 1': [],
          'Kelas 2': [],
          'Kelas 3': [],
          'Kelas 4': [],
          'Kelas 5': [],
          'Kelas 6': [],
        };
        const cloudIds = new Set<string>();

        snap.docs.forEach((docSnap) => {
          cloudIds.add(docSnap.id);
          const d = docSnap.data();
          const cls = d.kelas as ClassGrade;
          if (!byClass[cls]) return;
          byClass[cls].push({
            date: String(d.date || ''),
            topic: String(d.topic || ''),
            records: (d.records || {}) as ClassAttendanceSession['records'],
            updatedAt: String(d.clientUpdatedAt || new Date().toISOString()),
          });
        });

        ALL_CLASSES.forEach((cls) => {
          byClass[cls].sort((a, b) => b.date.localeCompare(a.date));
          saveClassAttendance(cls, byClass[cls]);
        });
        callbacks.onAttendanceByClass(byClass, cloudIds);
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/attendanceSessions`)
    )
  );

  // 4. Curriculum meta listener
  const currMetaQ = query(
    collection(db, 'users', uid, 'curriculumMeta'),
    where('ownerId', '==', uid)
  );
  unsubscribes.push(
    onSnapshot(
      currMetaQ,
      (snap) => {
        hasMeta = !snap.empty;
        if (!snap.empty) {
          const d = snap.docs[0].data();
          latestMeta = {
            sourceFileName: d.sourceFileName ? String(d.sourceFileName) : null,
            importedAt: d.importedAt ? String(d.importedAt) : null,
            detectedSheets: Array.isArray(d.detectedSheets) ? d.detectedSheets : [],
          };
          emitCurriculum();
        }
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/curriculumMeta`)
    )
  );

  // 5. Curriculum classes listener
  const currClsQ = query(
    collection(db, 'users', uid, 'curriculumClasses'),
    where('ownerId', '==', uid)
  );
  unsubscribes.push(
    onSnapshot(
      currClsQ,
      (snap) => {
        if (!snap.empty) {
          const updatedClasses = { ...latestCurriculumClasses };
          knownCurriculumKeys.clear();
          snap.docs.forEach((docSnap) => {
            knownCurriculumKeys.add(docSnap.id);
            const d = docSnap.data();
            const cls = d.kelas as ClassGrade;
            if (!cls || !updatedClasses[cls]) return;
            updatedClasses[cls] = {
              kelas: cls,
              fase: d.fase,
              identity: d.identity,
              cpSourceSheet: d.cpSourceSheet ? String(d.cpSourceSheet) : null,
              atpSourceSheet: d.atpSourceSheet ? String(d.atpSourceSheet) : null,
              cpRows: Array.isArray(d.cpRows) ? d.cpRows : [],
              atpRows: Array.isArray(d.atpRows) ? d.atpRows : [],
              protaRows: Array.isArray(d.protaRows) ? d.protaRows : [],
              promesRows: Array.isArray(d.promesRows) ? d.promesRows : [],
              materials: Array.isArray(d.materials) ? d.materials : [],
              modulAjarList: Array.isArray(d.modulAjarList) ? d.modulAjarList : [],
              assessmentPackage: d.assessmentPackage,
              totalJpSemester1: Number(d.totalJpSemester1) || 0,
              updatedAt: String(d.packageUpdatedAt || new Date().toISOString()),
            };
          });
          latestCurriculumClasses = updatedClasses;
          emitCurriculum();
        }
      },
      (error) =>
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/curriculumClasses`)
    )
  );

  return () => {
    unsubscribes.forEach((u) => u());
  };
}
