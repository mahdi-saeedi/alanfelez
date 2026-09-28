{{- define "data.labels" -}}
app.kubernetes.io/part-of: alanfelez
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}
