/**
 * Parse the customer-center filter fields embedded in a batch-action form.
 *
 * Keep this conversion independent from server actions so the filter contract
 * can be regression-tested without initializing the database action module.
 */
export function getCustomerFilterParamsFromFormData(formData: FormData) {
  return {
    queue: String(formData.get("queue") ?? ""),
    executionClasses: formData
      .getAll("executionClasses")
      .map((value) => String(value).trim()),
    grades: formData.getAll("grades").map((value) => String(value).trim()),
    teamId: String(formData.get("teamId") ?? "").trim(),
    salesId: String(formData.get("salesId") ?? "").trim(),
    search: String(formData.get("search") ?? "").trim(),
    productKeys: formData.getAll("productKeys").map((value) => String(value).trim()),
    productKeyword: String(formData.get("productKeyword") ?? "").trim(),
    tagIds: formData.getAll("tagIds").map((value) => String(value).trim()),
    assignedFrom: String(formData.get("assignedFrom") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
    page: String(formData.get("page") ?? "1").trim(),
    pageSize: String(formData.get("pageSize") ?? "").trim(),
  };
}
