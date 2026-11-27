import type { CaseFileAnswers } from "./case-file";
import type { ConsentVersion } from "./consent";

export function consentInitialValues(current?: ConsentVersion, prefill?: CaseFileAnswers): Record<string, string> {
  return {
    firstName: current?.first_name ?? prefill?.firstName ?? "", middleName: current?.middle_name ?? prefill?.middleName ?? "",
    lastName: current?.last_name ?? prefill?.lastName ?? "", dob: current?.date_of_birth ?? prefill?.dob ?? "",
    address: current?.address ?? prefill?.address ?? "", phone: current?.phone ?? prefill?.phone ?? "",
    email: current?.email ?? "", emergencyName: current?.emergency_name ?? "", emergencyPhone: current?.emergency_phone ?? "",
  };
}
