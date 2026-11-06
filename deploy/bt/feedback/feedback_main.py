# -*- coding: utf-8 -*-
"""反馈墙（开源版）· 宝塔面板第三方应用插件后端。
类名必须与文件名一致（feedback_main），方法由插件前端以 POST /plugin 调用。
所有耗时操作都丢到后台执行，避免面板请求超时；日志落在插件目录 install.log。
"""
import os
import public


class feedback_main:
    _plugin = '/www/server/panel/plugin/feedback'
    _shell = _plugin + '/install.sh'
    _log = _plugin + '/install.log'
    _cred = _plugin + '/credentials.txt'
    _env = '/www/wwwroot/feedback/.env'

    def _exec(self, cmd):
        """执行 shell 并返回 stdout（宝塔 public.ExecShell 返回 (stdout, stderr)）。"""
        try:
            r = public.ExecShell(cmd)
            if isinstance(r, (list, tuple)):
                return r[0] or ''
            return str(r)
        except Exception as e:
            return '执行失败: %s' % e

    def _background(self, action):
        """后台执行动作，日志追加到 install.log。"""
        cmd = 'nohup bash %s %s >> %s 2>&1 &' % (self._shell, action, self._log)
        self._exec(cmd)
        return {'status': True, 'msg': '任务已提交，请稍后点击「刷新状态」查看结果'}

    def _tail(self, path, lines=120):
        if not os.path.exists(path):
            return '（暂无日志）'
        try:
            with open(path, 'r') as f:
                return ''.join(f.readlines()[-lines:])
        except Exception as e:
            return '读取日志失败: %s' % e

    def get_status(self, get):
        """返回安装状态、容器状态、HTTP 探测结果与最近日志。"""
        status = self._exec('bash %s status' % self._shell)
        log = self._tail(self._log)
        return {
            'status': True,
            'data': {
                'has_env': os.path.exists(self._env),
                'raw': status,
                'log': log,
            }
        }

    def deploy(self, get):
        return self._background('deploy')

    def stop(self, get):
        return self._background('stop')

    def restart_app(self, get):
        return self._background('restart')

    def uninstall_app(self, get):
        return self._background('uninstall_app')

    def get_logs(self, get):
        return {'status': True, 'msg': self._tail(self._log, 200)}

    def get_credentials(self, get):
        if not os.path.exists(self._cred):
            return {'status': False, 'msg': '尚未生成凭据，请先执行「一键部署」。'}
        try:
            with open(self._cred, 'r') as f:
                return {'status': True, 'msg': f.read()}
        except Exception as e:
            return {'status': False, 'msg': '读取失败: %s' % e}
