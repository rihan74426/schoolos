// Labels for the printable report card. Subject and student names are printed exactly as entered.
export type ReportLocale = "en" | "bn" | "ar";
const L = {
  en: { card: "Report card", student: "Student", id: "ID", cls: "Class", section: "Section", exam: "Exam", subject: "Subject", marks: "Marks", full: "Full marks", grade: "Grade", total: "Total", percent: "Percentage", gpa: "GPA", result: "Result", pass: "Passed", fail: "Failed", absent: "Absent", exempt: "Exempt", decided: "Result decided by the exam controller", version: "Version", published: "Published", sign1: "Class teacher", sign2: "Principal" },
  bn: { card: "রিপোর্ট কার্ড", student: "শিক্ষার্থী", id: "আইডি", cls: "শ্রেণি", section: "শাখা", exam: "পরীক্ষা", subject: "বিষয়", marks: "প্রাপ্ত নম্বর", full: "পূর্ণমান", grade: "গ্রেড", total: "মোট", percent: "শতকরা", gpa: "জিপিএ", result: "ফলাফল", pass: "উত্তীর্ণ", fail: "অনুত্তীর্ণ", absent: "অনুপস্থিত", exempt: "অব্যাহতি", decided: "পরীক্ষা নিয়ন্ত্রকের সিদ্ধান্তে ফলাফল", version: "সংস্করণ", published: "প্রকাশিত", sign1: "শ্রেণি শিক্ষক", sign2: "অধ্যক্ষ" },
  ar: { card: "بطاقة النتيجة", student: "الطالب", id: "الرقم", cls: "الصف", section: "الشعبة", exam: "الاختبار", subject: "المادة", marks: "الدرجة", full: "الدرجة الكاملة", grade: "التقدير", total: "المجموع", percent: "النسبة", gpa: "المعدل", result: "النتيجة", pass: "ناجح", fail: "راسب", absent: "غائب", exempt: "معفى", decided: "النتيجة بقرار مسؤول الاختبارات", version: "النسخة", published: "تاريخ النشر", sign1: "معلم الصف", sign2: "المدير" },
} as const;
export const reportLabels = (locale: string) => L[(locale in L ? locale : "en") as ReportLocale];
export const reportDir = (locale: string) => (locale === "ar" ? "rtl" : "ltr");
