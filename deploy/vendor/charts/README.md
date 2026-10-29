# Vendored Helm charts

Outside charts used by the staging and production clusters, unpacked here so Argo CD reads them from this git repo.
Servers in Iran fetch GitHub Pages chart indexes at a few KB/s (Helm times out) and not at all during an internet
shutdown; git works, and the charts are reviewable in PRs.

| Chart | Version | Source |
|---|---|---|
| argo-cd | 10.9.2 | https://argoproj.github.io/argo-helm (installed once by hand, DEPLOYMENT.md §3) |
| argo-rollouts | 2.43.2 | https://argoproj.github.io/argo-helm |
| cert-manager | v1.19.1 | https://charts.jetstack.io |
| sealed-secrets | 2.17.9 | https://bitnami.github.io/sealed-secrets |
| cloudnative-pg | 0.29.1 | https://cloudnative-pg.github.io/charts |
| kube-prometheus-stack | 92.15.0 | https://prometheus-community.github.io/helm-charts |
| prometheus-blackbox-exporter | 11.20.2 | https://prometheus-community.github.io/helm-charts |
| loki | 7.5.0 | https://grafana.github.io/helm-charts |
| alloy | 1.14.4 | https://grafana.github.io/helm-charts |

To upgrade one: delete its folder, then
`helm pull <chart> --repo <source> --version <new> --untar --untardir deploy/vendor/charts`, update this table, the
comment in `deploy/argocd/envs/*/00-*.yaml`, and the image tags in `deploy/mirror-images.txt` (the images must be in the
ArvanCloud registry before the cluster can start them).
