(() => {
  const setupSection = document.getElementById('task-setup');
  const annotationSection = document.getElementById('annotation-view');
  const createForm = document.getElementById('create-task-form');
  const taskNameInput = document.getElementById('task-name');
  const createTaskButton = document.getElementById('create-task-button');
  const directoryListEl = document.getElementById('directory-list');
  const directoryHintEl = document.getElementById('directory-hint');
  const directoryRootInput = document.getElementById('directory-root-input');
  const directoryRootDisplay = document.getElementById('directory-root-display');
  const loadDirectoryRootButton = document.getElementById('load-directory-root');
  const resetDirectoryRootButton = document.getElementById('reset-directory-root');
  const upDirectoryRootButton = document.getElementById('up-directory-root');
  const createTaskMessageEl = document.getElementById('create-task-message');
  const taskListEl = document.getElementById('task-list');
  const taskHintEl = document.getElementById('task-hint');
  const backButton = document.getElementById('back-button');
  const taskHeading = document.getElementById('task-heading');

  const progressEl = document.getElementById('progress');
  const statusEl = document.getElementById('status');
  const imageEl = document.getElementById('annotated-image');
  const filenameEl = document.getElementById('filename');
  const ratingButtons = Array.from(document.querySelectorAll('.rating'));
  const nextButton = document.getElementById('next-button');

  const state = {
    directoryTree: null,
    directoryRoot: '',
    defaultRoot: '',
    tasks: [],
    activeTask: null,
    currentImage: null,
    currentImageToken: null,
    selectedRating: null,
    total: 0,
    completed: 0,
  };

  function normaliseSeparators(path) {
    return path.replace(/\\+/g, '/');
  }

  function getParentPath(path) {
    if (!path) {
      return '';
    }
    const normalised = normaliseSeparators(path);
    if (normalised === '/') {
      return '/';
    }
    const trimmed = normalised.replace(/\/+$/, '');
    if (!trimmed) {
      return '';
    }
    const windowsMatch = trimmed.match(/^([a-zA-Z]:)(?:\/(.*))?$/);
    if (windowsMatch) {
      const drive = windowsMatch[1];
      const remainder = windowsMatch[2];
      if (!remainder) {
        return `${drive}/`;
      }
      const segments = remainder.split('/').filter(Boolean);
      if (!segments.length) {
        return `${drive}/`;
      }
      segments.pop();
      return segments.length ? `${drive}/${segments.join('/')}` : `${drive}/`;
    }
    const isAbsolute = trimmed.startsWith('/');
    const segments = trimmed.split('/').filter(Boolean);
    if (!segments.length) {
      return isAbsolute ? '/' : '';
    }
    segments.pop();
    if (!segments.length) {
      return isAbsolute ? '/' : '';
    }
    const parent = segments.join('/');
    return isAbsolute ? `/${parent}` : parent;
  }

  function setStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.dataset.type = type;
  }

  function setProgress(message) {
    progressEl.textContent = message;
  }

  function updateProgress(total, completed, remaining) {
    if (!Number.isFinite(total) || total <= 0) {
      setProgress('任务中没有可用图像。');
      return;
    }
    const leftover = typeof remaining === 'number' ? remaining : Math.max(total - completed, 0);
    setProgress(`任务进度：已完成 ${completed}/${total}，剩余 ${Math.max(leftover, 0)}`);
  }

  function clearAnnotationSelection() {
    state.selectedRating = null;
    ratingButtons.forEach((btn) => btn.classList.remove('selected'));
    nextButton.disabled = true;
  }

  function disableAnnotationControls() {
    ratingButtons.forEach((btn) => {
      btn.disabled = true;
      btn.classList.remove('selected');
    });
    nextButton.disabled = true;
  }

  function enableAnnotationControls() {
    ratingButtons.forEach((btn) => {
      btn.disabled = false;
    });
    nextButton.disabled = true;
  }

  function resetAnnotationView() {
    state.currentImage = null;
    state.currentImageToken = null;
    state.selectedRating = null;
    state.total = 0;
    state.completed = 0;
    imageEl.removeAttribute('src');
    imageEl.alt = '正在加载图像';
    filenameEl.textContent = '';
    clearAnnotationSelection();
    disableAnnotationControls();
    setProgress('');
    setStatus('');
  }

  function showSetupView() {
    annotationSection.classList.add('hidden');
    setupSection.classList.remove('hidden');
    resetAnnotationView();
    createTaskMessageEl.textContent = '';
    try {
      taskNameInput.focus({ preventScroll: true });
    } catch (error) {
      taskNameInput.focus();
    }
  }

  function showAnnotationView(taskName) {
    setupSection.classList.add('hidden');
    annotationSection.classList.remove('hidden');
    taskHeading.textContent = `任务：${taskName}`;
  }

  function renderDirectories() {
    directoryListEl.innerHTML = '';
    createTaskMessageEl.textContent = '';
    const tree = state.directoryTree;
    const rootPath = state.directoryRoot;
    directoryRootDisplay.textContent = rootPath || '（未选择）';
    if (!directoryRootInput.value) {
      directoryRootInput.value = rootPath || '';
    }
    if (!tree || !Number.isFinite(tree.image_count) || tree.image_count === 0) {
      directoryHintEl.textContent = rootPath
        ? '当前根目录中没有可标注的图像，请尝试切换其他目录。'
        : '尚未加载任何图像目录。';
      createTaskButton.disabled = true;
      return;
    }

    directoryHintEl.textContent = '可多选，任务将遍历所选目录及其子目录中的全部图像。';
    createTaskButton.disabled = false;

    const list = document.createElement('ul');
    list.className = 'directory-tree';
    const rootNode = createDirectoryNode(tree, 0, rootPath);
    if (rootNode) {
      list.appendChild(rootNode);
    }
    directoryListEl.appendChild(list);
  }

  async function loadDirectoryTree(rootPath) {
    const params = new URLSearchParams();
    if (rootPath) {
      params.set('path', rootPath);
    }
    const query = params.toString();
    const url = query ? `/api/directory-tree?${query}` : '/api/directory-tree';
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '加载目录失败');
      }
      const data = await response.json();
      state.directoryTree = data.tree ?? null;
      state.directoryRoot = data.root || rootPath || '';
      directoryRootInput.value = state.directoryRoot;
      renderDirectories();
      createTaskMessageEl.textContent = '';
    } catch (error) {
      createTaskMessageEl.textContent = error.message || '加载目录失败。';
      if (!state.directoryTree) {
        directoryListEl.innerHTML = '';
        directoryHintEl.textContent = error.message || '加载目录失败。';
        createTaskButton.disabled = true;
      }
      directoryRootInput.value = state.directoryRoot || '';
    }
  }

  function createDirectoryNode(node, depth, rootPath) {
    if (!node) {
      return null;
    }
    const li = document.createElement('li');
    li.className = 'directory-node';
    li.dataset.depth = depth;

    const label = document.createElement('label');
    label.className = 'directory-entry';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'directories';
    const absolutePath = node.absolute_path || rootPath || '';
    checkbox.value = absolutePath;
    checkbox.dataset.relativePath = node.path || '';

    const info = document.createElement('span');
    info.className = 'directory-info';

    const displayName = node.path ? node.name : absolutePath || '全部图像';
    const countLabel = node.image_count === 1 ? '1 张' : `${node.image_count} 张`;
    info.textContent = `${displayName}（共 ${countLabel}）`;
    info.title = absolutePath;

    label.append(checkbox, info);
    li.appendChild(label);

    if (Array.isArray(node.subdirectories) && node.subdirectories.length > 0) {
      const childrenList = document.createElement('ul');
      childrenList.className = 'directory-children';
      node.subdirectories.forEach((child) => {
        const childNode = createDirectoryNode(child, depth + 1, rootPath);
        if (childNode) {
          childrenList.appendChild(childNode);
        }
      });
      if (childrenList.childNodes.length > 0) {
        li.appendChild(childrenList);
      }
    }

    return li;
  }

  function renderTasks() {
    taskListEl.innerHTML = '';
    const activeTasks = state.tasks.filter((task) => task.status === 'in_progress');
    const completedTasks = state.tasks.filter((task) => task.status === 'completed');
    const emptyTasks = state.tasks.filter((task) => task.status === 'empty');

    if (!state.tasks.length) {
      taskHintEl.textContent = '尚未创建任何标注任务。';
      return;
    }

    const appendTask = (task, disabled, reason) => {
      const item = document.createElement('li');
      item.className = 'task-item';

      const info = document.createElement('div');
      info.className = 'task-label';

      const nameEl = document.createElement('strong');
      nameEl.textContent = task.name;

      const meta = document.createElement('span');
      meta.className = 'task-meta';
      if (task.total > 0) {
        meta.textContent = `进度 ${task.completed}/${task.total}`;
      } else {
        meta.textContent = '无可用图像';
      }

      info.append(nameEl, meta);

      if (disabled) {
        const tag = document.createElement('span');
        tag.className = 'task-meta';
        tag.textContent = reason;
        item.append(info, tag);
      } else {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '继续标注';
        button.addEventListener('click', () => {
          enterTask(task.name);
        });
        item.append(info, button);
      }

      taskListEl.appendChild(item);
    };

    activeTasks.forEach((task) => appendTask(task, false));
    completedTasks.forEach((task) => appendTask(task, true, '已完成'));
    emptyTasks.forEach((task) => appendTask(task, true, '无有效图像'));

    if (!activeTasks.length) {
      taskHintEl.textContent = '暂无未完成任务，可创建新任务或重新选择目录。';
    } else {
      taskHintEl.textContent = '';
    }
  }

  async function bootstrap() {
    try {
      const response = await fetch('/api/bootstrap');
      if (!response.ok) {
        throw new Error('初始化失败');
      }
      const data = await response.json();
      state.directoryTree = data.directoryTree ?? null;
      state.defaultRoot = data.defaultRoot || '';
      state.directoryRoot = state.defaultRoot;
      directoryRootInput.value = state.directoryRoot;
      state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      renderDirectories();
      renderTasks();
    } catch (error) {
      state.directoryTree = null;
      state.tasks = [];
      state.directoryRoot = '';
      directoryHintEl.textContent = error.message || '加载目录失败。';
      taskHintEl.textContent = error.message || '加载任务列表失败。';
      createTaskButton.disabled = true;
      renderDirectories();
    }
  }

  async function refreshTasks() {
    try {
      const response = await fetch('/api/tasks');
      if (!response.ok) {
        throw new Error('刷新任务列表失败');
      }
      const data = await response.json();
      state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      renderTasks();
    } catch (error) {
      taskHintEl.textContent = error.message || '刷新任务列表失败。';
    }
  }

  async function fetchNextImage() {
    if (!state.activeTask) {
      return;
    }
    clearAnnotationSelection();
    setStatus('正在加载下一张图像…');
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(state.activeTask)}/next`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('任务不存在或已删除。');
        }
        throw new Error('获取下一张图像失败。');
      }
      const data = await response.json();
      state.total = data.total ?? 0;
      state.completed = data.completed ?? 0;
      updateProgress(state.total, state.completed, data.remaining);

      if (!data.image) {
        state.currentImage = null;
        state.currentImageToken = null;
        imageEl.removeAttribute('src');
        imageEl.alt = '暂无未标注图像';
        filenameEl.textContent = '';
        disableAnnotationControls();
        setStatus('任务已全部完成 🎉', 'success');
        await refreshTasks();
        return;
      }

      const imageInfo = data.image;
      state.currentImage = imageInfo.path || null;
      state.currentImageToken = imageInfo.token || null;
      if (!state.currentImage || !state.currentImageToken) {
        disableAnnotationControls();
        setStatus('图像信息缺失。', 'error');
        return;
      }
      const encodedTask = encodeURIComponent(state.activeTask);
      const encodedToken = encodeURIComponent(state.currentImageToken);
      imageEl.src = `/api/tasks/${encodedTask}/image?token=${encodedToken}&t=${Date.now()}`;
      const displayName = imageInfo.display_path || imageInfo.name || imageInfo.path;
      imageEl.alt = displayName || '待标注图像';
      filenameEl.textContent = displayName || '';
      enableAnnotationControls();
      setStatus('');
    } catch (error) {
      disableAnnotationControls();
      setStatus(error.message || '请求失败，请稍后再试。', 'error');
    }
  }

  async function submitAnnotation() {
    if (!state.activeTask) {
      setStatus('未选择任务。', 'error');
      return;
    }
    if (!state.currentImage) {
      setStatus('没有可标注的图像。', 'error');
      return;
    }
    if (typeof state.selectedRating !== 'number') {
      setStatus('请选择评分后再继续。', 'error');
      return;
    }

    nextButton.disabled = true;
    setStatus('正在保存评分…');

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(state.activeTask)}/annotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: state.currentImage,
          rating: state.selectedRating,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '保存评分失败');
      }

      setStatus('评分已保存。', 'success');
      await fetchNextImage();
    } catch (error) {
      setStatus(error.message || '提交失败，请稍后再试。', 'error');
      nextButton.disabled = false;
    }
  }

  function enterTask(taskName) {
    state.activeTask = taskName;
    showAnnotationView(taskName);
    resetAnnotationView();
    fetchNextImage();
  }

  function handleCreateTask(event) {
    event.preventDefault();
    const taskName = taskNameInput.value.trim();
    const selected = Array.from(directoryListEl.querySelectorAll('input[name="directories"]:checked')).map(
      (input) => input.value,
    );

    createTaskMessageEl.textContent = '';
    setStatus('');
    if (!taskName) {
      createTaskMessageEl.textContent = '请填写任务名称。';
      taskNameInput.focus();
      return;
    }
    if (!selected.length) {
      createTaskMessageEl.textContent = '请选择至少一个图像文件夹。';
      return;
    }

    createTaskButton.disabled = true;
    createTaskMessageEl.textContent = '正在创建任务…';

    fetch('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: taskName,
        directories: selected,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || '创建任务失败');
        }
        const data = await response.json();
        createTaskMessageEl.textContent = '';
        if (data.task) {
          state.tasks.push(data.task);
        }
        createForm.reset();
        directoryRootInput.value = state.directoryRoot;
        enterTask(taskName);
        await refreshTasks();
      })
      .catch((error) => {
        createTaskMessageEl.textContent = error.message || '创建任务失败。';
      })
      .finally(() => {
        createTaskButton.disabled = false;
      });
  }

  function handleBackToSetup() {
    state.activeTask = null;
    showSetupView();
    refreshTasks();
  }

  ratingButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.activeTask || !state.currentImage || btn.disabled) {
        return;
      }
      const rating = Number.parseInt(btn.dataset.rating, 10);
      state.selectedRating = rating;
      ratingButtons.forEach((button) => {
        button.classList.toggle('selected', button === btn);
      });
      nextButton.disabled = false;
      setStatus('');
    });
  });

  nextButton.addEventListener('click', submitAnnotation);
  createForm.addEventListener('submit', handleCreateTask);
  backButton.addEventListener('click', handleBackToSetup);
  loadDirectoryRootButton.addEventListener('click', () => {
    const rawPath = directoryRootInput.value.trim();
    if (!rawPath) {
      loadDirectoryTree(state.defaultRoot || '');
      return;
    }
    loadDirectoryTree(rawPath);
  });
  upDirectoryRootButton.addEventListener('click', () => {
    const currentRoot = state.directoryRoot || state.defaultRoot || '';
    if (!currentRoot) {
      loadDirectoryTree('');
      return;
    }
    const parent = getParentPath(currentRoot);
    loadDirectoryTree(parent || currentRoot);
  });
  resetDirectoryRootButton.addEventListener('click', () => {
    if (state.defaultRoot) {
      loadDirectoryTree(state.defaultRoot);
    } else {
      loadDirectoryTree('');
    }
  });
  directoryRootInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loadDirectoryRootButton.click();
    }
  });

  showSetupView();
  bootstrap();
})();
