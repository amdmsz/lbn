"use server";

import {
  updateCollectionTaskAction as updateCollectionTaskActionInternal,
  upsertCollectionTaskAction as upsertCollectionTaskActionInternal,
} from "@/app/(dashboard)/orders/actions";

export async function upsertCollectionTaskAction(formData: FormData) {
  return upsertCollectionTaskActionInternal(formData);
}

export async function updateCollectionTaskAction(formData: FormData) {
  return updateCollectionTaskActionInternal(formData);
}
