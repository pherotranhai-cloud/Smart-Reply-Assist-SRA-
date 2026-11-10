#!/usr/bin/env python3
"""Summarize run_suite.js results.json.

Usage: python3 summarize.py pwa-test-run/results.json [--audit pwa-test-run/audit.json] [--json out.json]

Prints (markdown):
  - per-feature table: distinct scenarios, repeat runs, total executions, passed, failed, pass rate
  - whether each feature meets the >=30 executions / >=20 scenarios / >=10 repeats target
  - flaky cases (same case passed and failed across repeats)
  - failure clusters: failures grouped by normalized error message
"""
import json
import re
import sys
from collections import defaultdict, OrderedDict


def norm(msg):
    if not msg:
        return "(no message)"
    m = re.sub(r"\d+", "N", msg)
    m = re.sub(r"https?://[^\s'\"]+", "URL", m)
    return m[:160]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    path = args[0]
    audit_path = args[args.index("--audit") + 1] if "--audit" in args else None
    json_out = args[args.index("--json") + 1] if "--json" in args else None

    data = json.load(open(path, encoding="utf-8"))
    ex = data["executions"]

    feats = OrderedDict()
    for e in ex:
        f = feats.setdefault(e["feature"], {
            "name": e.get("featureName") or e["feature"], "scenarios": set(), "repeat_cases": set(),
            "repeat_runs": 0, "total": 0, "passed": 0, "failed": 0})
        f["total"] += 1
        if e["kind"] == "repeat":
            f["repeat_cases"].add(e["caseId"])
            f["repeat_runs"] += 1
        else:
            f["scenarios"].add(e["caseId"])
        if e["status"] == "passed":
            f["passed"] += 1
        else:
            f["failed"] += 1

    print(f"# Tổng hợp kết quả — {data['meta'].get('baseURL')}\n")
    print("| Tính năng | Kịch bản | Lượt lặp | Tổng lượt | Đạt | Lỗi | Tỷ lệ đạt | Đủ chỉ tiêu |")
    print("|---|---|---|---|---|---|---|---|")
    summary_feats = []
    for fid, f in feats.items():
        ok = f["total"] >= 30 and len(f["scenarios"]) >= 20 and f["repeat_runs"] >= 10
        rate = f["passed"] / f["total"] * 100 if f["total"] else 0
        print(f"| {f['name']} | {len(f['scenarios'])} | {f['repeat_runs']} | {f['total']} | {f['passed']} | "
              f"{f['failed']} | {rate:.0f}% | {'✓' if ok else '✗ (cần ≥30 lượt, ≥20 kịch bản, ≥10 lặp)'} |")
        summary_feats.append({"id": fid, "name": f["name"], "scenarios": len(f["scenarios"]),
                              "repeatRuns": f["repeat_runs"], "total": f["total"], "passed": f["passed"],
                              "failed": f["failed"], "meetsTarget": ok})
    tot = len(ex)
    tp = sum(1 for e in ex if e["status"] == "passed")
    print(f"\n**Tổng:** {tp}/{tot} lượt đạt.\n")

    # flaky
    by_case = defaultdict(list)
    for e in ex:
        by_case[(e["feature"], e["caseId"])].append(e)
    flaky = []
    for (fid, cid), runs in by_case.items():
        st = {r["status"] == "passed" for r in runs}
        if len(runs) > 1 and st == {True, False}:
            nf = sum(1 for r in runs if r["status"] != "passed")
            flaky.append({"feature": fid, "caseId": cid, "title": runs[0]["title"], "failed": nf, "runs": len(runs)})
    if flaky:
        print("## Ca chập chờn (flaky)\n")
        for fl in flaky:
            print(f"- `{fl['feature']}/{fl['caseId']}` {fl['title']}: lỗi {fl['failed']}/{fl['runs']} lượt")
        print()

    # clusters
    clusters = OrderedDict()
    for e in ex:
        if e["status"] == "passed":
            continue
        key = norm(e.get("error"))
        c = clusters.setdefault(key, {"error": e.get("error"), "cases": OrderedDict(), "count": 0,
                                      "statuses": set(), "screenshot": e.get("screenshot"),
                                      "pageErrors": e.get("pageErrors")[:2], "failedRequests": e.get("failedRequests")[:3]})
        c["count"] += 1
        c["statuses"].add(e["status"])
        c["cases"].setdefault(f"{e['feature']}/{e['caseId']}", e["title"])
    if clusters:
        print("## Nhóm lỗi (theo thông báo lỗi)\n")
        for i, (k, c) in enumerate(clusters.items(), 1):
            print(f"### Nhóm {i} — {c['count']} lượt ({', '.join(sorted(c['statuses']))})")
            print(f"- Lỗi: `{c['error']}`")
            for cid, title in list(c["cases"].items())[:8]:
                print(f"  - {cid}: {title}")
            if len(c["cases"]) > 8:
                print(f"  - ... và {len(c['cases']) - 8} ca khác")
            if c["pageErrors"]:
                print(f"- Page error: `{c['pageErrors'][0]}`")
            if c["failedRequests"]:
                print(f"- Request lỗi: {'; '.join(c['failedRequests'])}")
            if c["screenshot"]:
                print(f"- Ảnh: {c['screenshot']}")
            print()
        print("_Lưu ý: 'error' = lỗi khi chạy script (thường là selector/timeout — kiểm tra lại test trước khi kết luận là bug)._\n")

    audit = None
    if audit_path:
        audit = json.load(open(audit_path, encoding="utf-8"))
        print("## PWA audit\n")
        for c in audit["checks"]:
            mark = {"pass": "✓", "warn": "!", "fail": "✗"}[c["status"]]
            print(f"- {mark} {c['title']}" + (f" — {c['detail']}" if c["detail"] else ""))
        print()

    if json_out:
        json.dump({"features": summary_feats, "flaky": flaky,
                   "clusters": [{"error": c["error"], "count": c["count"], "cases": list(c["cases"].keys())}
                                for c in clusters.values()],
                   "audit": audit and audit["summary"]}, open(json_out, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
