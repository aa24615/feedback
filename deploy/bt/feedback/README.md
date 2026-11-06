# 反馈墙（开源版）· 宝塔第三方应用插件
#
# 安装：软件商店 → 第三方应用 → 导入插件 → 上传 feedback.zip
# 使用：插件列表点「设置」→「一键部署」，部署日志在 install.log
# 文档：https://github.com/aa24615/feedback/blob/open-source/deploy/bt/README.md
#
# 文件说明
#   info.json             插件元数据（name 必须与目录名 feedback 一致）
#   install.sh            安装 / 部署 / 运维 / 卸载，支持 install|deploy|status|logs|stop|restart|uninstall|credentials
#   icon.png              插件图标
#   index.html            插件设置面板
#   feedback_main.py      插件后端方法
#   docker-compose.bt.yml 宝塔专用编排（自建 bridge 网络，不依赖 1panel-network）
#
# 默认安装目录 /www/wwwroot/feedback，可用 FEEDBACK_APP_DIR 覆盖。
# 卸载只停容器，不删除源码与 ./data 数据目录。
