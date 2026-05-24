<script setup lang="ts">
interface SchoolMatrixRow {
  city?: string;
  snr: string;
  name?: string;
}

interface Props {
  classCodes?: string[];
  classRowsCount?: number;
  error?: string;
  grandTotalClasses?: number;
  lowerThreshold?: number;
  upperThreshold?: number;
  schoolsInClassMatrix?: SchoolMatrixRow[];
  getClassHeaderLabel: (classCode: string) => string;
  getClassStudents: (snr: string, classCode: string) => number;
  totalForClass: (classCode: string) => number;
  totalForSchool: (snr: string) => number;
  classCellClass: (value: number) => string | Record<string, boolean> | string[];
}

const props = withDefaults(defineProps<Props>(), {
  classCodes: () => [],
  classRowsCount: 0,
  error: "",
  grandTotalClasses: 0,
  lowerThreshold: 0,
  upperThreshold: 0,
  schoolsInClassMatrix: () => [],
});

const emit = defineEmits<{
  (e: "update:lowerThreshold", value: number): void;
  (e: "update:upperThreshold", value: number): void;
}>();

function updateLowerThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:lowerThreshold", Number(target?.value || 0));
}

function updateUpperThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:upperThreshold", Number(target?.value || 0));
}

function csvValue(value: string | number | null | undefined): string {
  const normalized = String(value ?? "");
  if (!/[;"\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function downloadCsvExport() {
  if (!props.classRowsCount) return;

  const header = [
    "Ort",
    "SNR",
    "Schule",
    ...props.classCodes.map((classCode) => props.getClassHeaderLabel(classCode)),
    "Summe",
  ];

  const lines = [
    header.map(csvValue).join(";"),
    ...props.schoolsInClassMatrix.map((school) => {
      const values = [
        school.city || "-",
        school.snr,
        school.name || "-",
        ...props.classCodes.map((classCode) => props.getClassStudents(school.snr, classCode)),
        props.totalForSchool(school.snr),
      ];
      return values.map(csvValue).join(";");
    }),
    [
      "Summe",
      "",
      "",
      ...props.classCodes.map((classCode) => props.totalForClass(classCode)),
      props.grandTotalClasses,
    ].map(csvValue).join(";"),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "klassenstaerken-export.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<template src="./ClassStrengthDashboard.html"></template>
<style scoped src="./ClassStrengthDashboard.css"></style>
