import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const ORG_TYPES = [
  { value: 'cohost', label: 'Co-host' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'activation', label: 'Activation partner' },
  { value: 'venue', label: 'Venue' },
]

export function orgTypeLabel(value) {
  return ORG_TYPES.find((t) => t.value === value)?.label ?? value
}

const orgsCol = collection(db, 'hp_orgs')

export async function listOrgs() {
  const snap = await getDocs(orgsCol)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function createOrg(data, uid) {
  const ref = await addDoc(orgsCol, {
    ...data,
    createdAt: serverTimestamp(),
    createdBy: uid,
  })
  return ref.id
}

export async function updateOrg(id, data) {
  await updateDoc(doc(db, 'hp_orgs', id), data)
}

export async function deleteOrg(id) {
  await deleteDoc(doc(db, 'hp_orgs', id))
}
