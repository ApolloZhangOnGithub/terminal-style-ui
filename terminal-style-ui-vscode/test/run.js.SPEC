# SPEC: test/run.js —— 集成测试启动器
# 2026-09-25 Claude Code：用本机 VSCode 起隔离实例（临时 user-data-dir / extensions-dir、剥掉终端环境变量、关闭被遮挡窗口停绘）
# 跑 test/smoke.js；--screenshot 模式按进程号只截测试窗口（<名>.request → <名>.png → <名>.done 文件协议）。
