from contextlib import contextmanager
from tornado import web
import nbformat
import base64
import os, io
import requests

from notebook.services.contents.largefilemanager import LargeFileManager


class YFileManager(LargeFileManager):
    def download_notebook(self, url, path):
        r = requests.get(url, stream=True)
        with open(path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=1024): 
                if chunk:
                    f.write(chunk)

    def convert_to_ynotebook(self, nb):
        for cell in nb.cells:
            cell['metadata']['active'] = True

        ncells = len(nb.cells)
        for i in range(ncells, 100):
            if i%2 == 0:
                cell = nbformat.v4.new_code_cell('')
            else:
                cell = nbformat.v4.new_markdown_cell('')
            cell['metadata']['id'] = i
            cell['metadata']['active'] = False
            nb.cells.append(cell)
        return nb

    def get(self, path, content=True, type=None, format=None, url=None):
        path = path.strip('/')

        if url:
            self.download_notebook(url, path)

        if not self.exists(path):
            raise web.HTTPError(404, u'No such file or directory: %s' % path)

        os_path = self._get_os_path(path)
        if os.path.isdir(os_path):
            if type not in (None, 'directory'):
                raise web.HTTPError(400,
                                u'%s is a directory, not a %s' % (path, type), reason='bad type')
            model = self._dir_model(path, content=content)
        elif type == 'notebook' or (type is None and path.endswith('.ipynb')):
            model = self._notebook_model(path, content=content)
        else:
            if type == 'directory':
                raise web.HTTPError(400,
                                u'%s is not a directory' % path, reason='bad type')
            model = self._file_model(path, content=content, format=format)
        return model

    def _notebook_model(self, path, content=True):
        model = self._base_model(path)
        model['type'] = 'notebook'
        os_path = self._get_os_path(path)
        
        if content:
            nb = self._read_notebook(os_path, as_version=4)
            nb = self.convert_to_ynotebook(nb)
            self.mark_trusted_cells(nb, path)
            model['content'] = nb
            model['format'] = 'json'
            self.validate_notebook_model(model)
            
        return model
