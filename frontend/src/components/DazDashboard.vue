<script setup lang="ts">
interface SchoolMatrixRow {
  city?: string;
  snr: string;
  name?: string;
}

interface Props {
  dazClassCodes?: string[];
  dazRowsCount?: number;
  error?: string;
  grandTotalDaz?: number;
  dazLowerThreshold?: number;
  dazUpperThreshold?: number;
  schoolsInDazMatrix?: SchoolMatrixRow[];
  getDaz: (snr: string, classCode: string) => number;
  getDazClassHeaderLabel: (classCode: string) => string;
  totalDazForClass: (classCode: string) => number;
  totalDazForSchool: (snr: string) => number;
  dazCellClass: (value: number) => string | Record<string, boolean> | string[];
}

const props = withDefaults(defineProps<Props>(), {
  dazClassCodes: () => [],
  dazRowsCount: 0,
  error: "",
  grandTotalDaz: 0,
  dazLowerThreshold: 0,
  dazUpperThreshold: 0,
  schoolsInDazMatrix: () => [],
});

const emit = defineEmits<{
  (e: "update:dazLowerThreshold", value: number): void;
  (e: "update:dazUpperThreshold", value: number): void;
}>();

function updateDazLowerThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:dazLowerThreshold", Number(target?.value || 0));
}

function updateDazUpperThreshold(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:dazUpperThreshold", Number(target?.value || 0));
}

function csvValue(value: string | number | null | undefined): string {
  const normalized = String(value ?? "");
  if (!/[;"\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function downloadCsvExport() {
  if (!props.dazRowsCount) return;

  const header = [
    "Ort",
    "SNR",
    "Schule",
    ...props.dazClassCodes.map((classCode) => props.getDazClassHeaderLabel(classCode)),
    "Summe",
  ];

  const lines = [
    header.map(csvValue).join(";"),
    ...props.schoolsInDazMatrix.map((school) => {
      const values = [
        school.city || "-",
        school.snr,
        school.name || "-",
        ...props.dazClassCodes.map((classCode) => props.getDaz(school.snr, classCode)),
        props.totalDazForSchool(school.snr),
      ];
      return values.map(csvValue).join(";");
    }),
    [
      "Summe",
      "",
      "",
      ...props.dazClassCodes.map((classCode) => props.totalDazForClass(classCode)),
      props.grandTotalDaz,
    ].map(csvValue).join(";"),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "daz-export.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
</script>

<template src="./DazDashboard.html"></template>
<style scoped src="./DazDashboard.css"></style>
