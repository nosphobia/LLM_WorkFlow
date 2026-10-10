# Codex 샌드박스 안에서만 쓰는 Python 보정 모듈. 래퍼가 프로젝트 Codex 설정으로 Codex 명령의 PYTHONPATH에만 넣는다.
# Python 3.13의 tempfile.mkdtemp는 Windows에서 새 폴더를 만든 사용자만 쓸 수 있게 권한을 제한한다(CVE-2024-4030 대응).
# 샌드박스의 제한된 권한으로는 그런 폴더를 지울 수 없어 TemporaryDirectory 정리가 늘 실패한다.
# 그래서 mkdtemp의 권한 처리만 바꿔 상위 폴더의 권한을 그대로 물려받게 한다. 이름 짓기, 재시도, 감사 이벤트는 원본과 같다.
# 필요한 내부 함수가 없는 Python이면 보정하지 않는다.
import os as _os
import sys as _sys

if _os.name == "nt" and _sys.version_info >= (3, 13):
    import errno as _errno
    import tempfile as _tempfile

    if hasattr(_tempfile, "_sanitize_params") and hasattr(_tempfile, "_get_candidate_names"):

        def _mkdtemp(suffix=None, prefix=None, dir=None):
            prefix, suffix, dir, output_type = _tempfile._sanitize_params(prefix, suffix, dir)
            names = _tempfile._get_candidate_names()
            if output_type is bytes:
                names = map(_os.fsencode, names)
            for seq in range(_tempfile.TMP_MAX):
                name = next(names)
                file = _os.path.join(dir, prefix + name + suffix)
                _sys.audit("tempfile.mkdtemp", file)
                try:
                    _os.mkdir(file)  # 원본은 _os.mkdir(file, 0o700)
                except FileExistsError:
                    continue
                except PermissionError:
                    if _os.path.isdir(dir) and seq < _tempfile.TMP_MAX - 1:
                        continue
                    raise
                return _os.path.abspath(file)
            raise FileExistsError(_errno.EEXIST, "No usable temporary directory name found")

        _mkdtemp.__doc__ = _tempfile.mkdtemp.__doc__
        _tempfile.mkdtemp = _mkdtemp
