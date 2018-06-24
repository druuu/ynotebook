from contextlib import contextmanager
from tornado import web
import nbformat
import base64
import os, io
from pathlib import Path
import requests

from notebook.services.contents.largefilemanager import LargeFileManager


class YFileManager(LargeFileManager):
    def _download_notebook(self, url, as_version=4):
        try:
            r = requests.get(url)
            return nbformat.reads(r.content.decode(errors='ignore'), as_version=as_version)
        except Exception as e:
            raise HTTPError(
                400,
                u"Unreadable Notebook: %s %r" % (os_path, e_orig),
            )

    def _remote_notebook_model(self, url, path):
        model = self._base_model(path)
        model['type'] = 'notebook'
        nb = self._download_notebook(url, as_version=4)
        self.mark_trusted_cells(nb, path)
        model['content'] = nb
        model['format'] = 'json'
        self.validate_notebook_model(model)
        return model

    def remote_get(self, url):
        path = 'template.ipynb'
        model = self._remote_notebook_model(url, path)
        return model

    #def _save_notebook(self, os_path, nb):
    #    Path(os_path).touch(exist_ok=True)
