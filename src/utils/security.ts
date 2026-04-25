export interface SecurityValidationResult {
  isValid: boolean;
  errorKey?: string;
}

export const validateSecurity = (text: string): SecurityValidationResult => {
  // 1. TRIM_INPUT: Remove leading/trailing spaces.
  let normalizedText = text.trim();
  
  // 2. NORMALIZE: Convert input to lowercase for case-insensitive matching.
  // Also remove redundant whitespaces to prevent bypasses like "v i ế t c o d e".
  normalizedText = normalizedText.toLowerCase();
  const spacelessText = normalizedText.replace(/\s+/g, '');
  const singleSpaceText = normalizedText.replace(/\s+/g, ' ');

  const blockPattern = /(ignore.*instruction|bỏ qua.*rule|đóng vai trò|quên hướng dẫn|bypass|jailbreak|act as|system prompt|viết code|tạo mã|write code|programming|you are an ai|bạn không phải là ai|bạn là ai|who are you|hãy là một|nhập vai|mô phỏng|hãy đóng giả|identity|developer mode|dan mode|re-write instructions|vâng vâng)/i;
  
  // Create a spaceless version of the pattern to catch spaced out cheating texts
  const spacelessPattern = new RegExp(blockPattern.source.replace(/\s+/g, ''), 'i');

  // 3. DETECT: Use blockPattern.test(normalizedText)
  if (blockPattern.test(singleSpaceText) || spacelessPattern.test(spacelessText)) {
    // 4. RETURN: If detected, return object
    return { isValid: false, errorKey: 'SECURITY_FIREWALL_ERROR' };
  }

  return { isValid: true };
};
