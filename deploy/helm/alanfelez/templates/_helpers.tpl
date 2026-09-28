{{- define "af.labels" -}}
app.kubernetes.io/part-of: alanfelez
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "af.selector" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end }}

{{/* image: registry prefix + repository:tag */}}
{{- define "af.image" -}}
{{- $img := index .root.Values.images .name -}}
{{- if .root.Values.global.imageRegistry -}}
{{ .root.Values.global.imageRegistry }}/{{ $img.repository }}:{{ $img.tag }}
{{- else -}}
{{ $img.repository }}:{{ $img.tag }}
{{- end -}}
{{- end }}

{{- define "af.url" -}}
{{ .root.Values.global.scheme }}://{{ index .root.Values.global.hosts .host }}{{ .root.Values.global.publicPort }}
{{- end }}

{{- define "af.pullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets: {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/* Env shared by the API server and the bootstrap job */}}
{{- define "af.apiEnv" -}}
- { name: APP_ENV, value: {{ .Values.global.env | quote }} }
- { name: LOG_LEVEL, value: {{ .Values.api.logLevel | quote }} }
- { name: LOG_FORMAT, value: json }
- name: DATABASE_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.dataRelease }}-pg-app, key: uri } }
- { name: REDIS_URL, value: {{ default (printf "redis://%s-redis:6379/0" .Values.dataRelease) .Values.api.redisUrl | quote }} }
- { name: SEED_PROFILES, value: {{ .Values.api.seedProfiles | quote }} }
- { name: OIDC_ISSUER_URL, value: "{{ include "af.url" (dict "root" . "host" "auth") }}/realms/alanfelez" }
- { name: CORS_ORIGINS, value: {{ (default (list (include "af.url" (dict "root" . "host" "web")) (include "af.url" (dict "root" . "host" "admin"))) .Values.api.corsOrigins) | join "," | quote }} }
{{- range $k, $v := .Values.api.extraEnv }}
- { name: {{ $k }}, value: {{ $v | quote }} }
{{- end }}
{{- end }}

{{/* Workload kind: Argo Rollout (canary) or Deployment */}}
{{- define "af.workloadHeader" -}}
{{- if .root.Values.rollout.enabled -}}
apiVersion: argoproj.io/v1alpha1
kind: Rollout
{{- else -}}
apiVersion: apps/v1
kind: Deployment
{{- end }}
{{- end }}

{{- define "af.strategy" -}}
{{- if .root.Values.rollout.enabled }}
progressDeadlineSeconds: {{ .root.Values.rollout.progressDeadlineSeconds }}
progressDeadlineAbort: true
strategy:
  canary:
    # Argo Rollouts adds the canary ReplicaSet's rollouts-pod-template-hash to this Service's selector the moment
    # the ReplicaSet is created, so the analysis can only reach NEW pods. Argo CD must not revert that selector:
    # see ignoreDifferences in deploy/argocd/envs/*/20-alanfelez.yaml.
    canaryService: {{ .root.Release.Name }}-{{ .name }}-canary
    # Informational labels (kubectl get pods -L alanfelez.ir/rollout-role); never used for routing.
    canaryMetadata: { labels: { alanfelez.ir/rollout-role: canary } }
    stableMetadata: { labels: { alanfelez.ir/rollout-role: stable } }
    steps:
      {{- range .root.Values.rollout.steps }}
      {{- if hasKey . "analysis" }}
      {{- if eq $.name "api" }}
      - analysis: { templates: [{ templateName: {{ $.root.Release.Name }}-api-readiness }] }
      {{- end }}
      {{- else }}
      - {{ toJson . }}
      {{- end }}
      {{- end }}
{{- else }}
strategy:
  type: RollingUpdate
  rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
{{- end }}
{{- end }}
