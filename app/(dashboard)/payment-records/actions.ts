"use server";

import {
  reviewPaymentRecordAction as reviewPaymentRecordActionInternal,
  submitPaymentRecordAction as submitPaymentRecordActionInternal,
} from "@/app/(dashboard)/orders/actions";

export async function submitPaymentRecordAction(formData: FormData) {
  return submitPaymentRecordActionInternal(formData);
}

export async function reviewPaymentRecordAction(formData: FormData) {
  return reviewPaymentRecordActionInternal(formData);
}
