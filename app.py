from __future__ import annotations

import json
import threading
import base64
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set

from flask import Flask, jsonify, render_template, request, send_file

APP_ROOT = Path(__file__).parent.resolve()
IMAGES_DIR = APP_ROOT / "images"
DATA_DIR = APP_ROOT / "data"
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"}

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True

DATA_DIR.mkdir(parents=True, exist_ok=True)
data_lock = threading.Lock()


def validate_task_name(raw_name: str) -> str:
    name = (raw_name or "").strip()
    if not name:
        raise ValueError("任务名称不能为空。")
    if name in {".", ".."} or any(sep in name for sep in ("/", "\\")):
        raise ValueError("任务名称不能包含路径分隔符。")
    return name


def task_file(name: str) -> Path:
    return DATA_DIR / f"{name}.json"


def load_task(name: str) -> Dict[str, Any]:
    path = task_file(name)
    if not path.exists():
        raise FileNotFoundError("任务不存在。")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("任务数据已损坏。") from exc
    if not isinstance(data, dict):
        raise ValueError("任务数据格式无效。")
    data.setdefault("name", name)
    directories = data.get("directories", [])
    if not isinstance(directories, list) or not all(isinstance(item, str) for item in directories):
        raise ValueError("任务目录数据无效。")
    normalised_directories: List[str] = []
    for item in directories:
        try:
            resolved = normalise_directory_path(item)
        except Exception:
            continue
        normalised_directories.append(str(resolved))
    data["directories"] = normalised_directories
    images = data.get("images", [])
    if not isinstance(images, list) or not all(isinstance(item, str) for item in images):
        raise ValueError("任务图像数据无效。")
    normalised_images: List[str] = []
    for item in images:
        try:
            resolved_image = normalise_image_path(item)
        except Exception:
            continue
        normalised_images.append(str(resolved_image))
    data["images"] = normalised_images
    annotations = data.get("annotations", {})
    if not isinstance(annotations, dict):
        annotations = {}
    normalised: Dict[str, int] = {}
    for key, value in annotations.items():
        if isinstance(key, str):
            try:
                resolved_key = normalise_image_path(key)
                normalised[str(resolved_key)] = int(value)
            except (ValueError, TypeError):
                continue
    # Keep annotations only for images that still exist in the task definition.
    data["annotations"] = {image: normalised[image] for image in normalised_images if image in normalised}
    return data


def save_task(name: str, payload: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = task_file(name)
    tmp_path = path.with_name(path.name + ".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    tmp_path.replace(path)


def normalise_directory_path(raw: str) -> Path:
    raw_value = (raw or "").strip()
    candidate = Path(raw_value).expanduser()
    if not candidate.is_absolute():
        if raw_value in {"", "."}:
            candidate = IMAGES_DIR
        else:
            candidate = IMAGES_DIR / raw_value
    return candidate.resolve(strict=False)


def normalise_image_path(raw: str) -> Path:
    raw_value = (raw or "").strip()
    candidate = Path(raw_value).expanduser()
    if not candidate.is_absolute():
        candidate = IMAGES_DIR / raw_value
    return candidate.resolve(strict=False)


def encode_path_token(path: str) -> str:
    return base64.urlsafe_b64encode(path.encode("utf-8")).decode("ascii")


def decode_path_token(token: str) -> str:
    try:
        return base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("无效的路径标识。") from exc


def collect_images(directories: Sequence[str]) -> List[str]:
    images: Set[Path] = set()
    for directory in directories:
        base = normalise_directory_path(directory)
        if not base.exists() or not base.is_dir():
            continue
        for file_path in base.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in ALLOWED_EXTENSIONS:
                images.add(file_path.resolve(strict=False))
    return sorted(str(path) for path in images)


def compute_display_path(image_path: Path, directories: Sequence[str]) -> str:
    for directory in directories:
        try:
            base = normalise_directory_path(directory)
        except Exception:
            continue
        try:
            relative = image_path.relative_to(base)
            return str(relative).replace("\\", "/")
        except ValueError:
            continue
    return image_path.name


def build_directory_tree(base: Path, relative: str = "") -> Optional[Dict[str, Any]]:
    if not base.exists() or not base.is_dir():
        return None
    subdirectories: List[Dict[str, Any]] = []
    image_count = 0
    direct_image_count = 0
    for entry in sorted(base.iterdir(), key=lambda path: path.name.lower()):
        if entry.is_dir():
            child_relative = f"{relative}/{entry.name}" if relative else entry.name
            child_node = build_directory_tree(entry, child_relative)
            if child_node:
                subdirectories.append(child_node)
                image_count += child_node["image_count"]
        elif entry.is_file() and entry.suffix.lower() in ALLOWED_EXTENSIONS:
            direct_image_count += 1
    image_count += direct_image_count
    if image_count == 0 and not subdirectories:
        return None
    resolved = base.resolve(strict=False)
    name = resolved.name if relative else str(resolved)
    return {
        "name": name,
        "path": relative,
        "absolute_path": str(resolved),
        "image_count": image_count,
        "direct_image_count": direct_image_count,
        "has_subdirectories": bool(subdirectories),
        "subdirectories": subdirectories,
    }


def summarise_task(data: Dict[str, Any]) -> Dict[str, Any]:
    annotations = data.get("annotations", {})
    if not isinstance(annotations, dict):
        annotations = {}
    existing_images: List[str] = []
    for item in data.get("images", []):
        if not isinstance(item, str):
            continue
        resolved = Path(item).expanduser().resolve(strict=False)
        if resolved.exists() and resolved.is_file():
            existing_images.append(str(resolved))
    completed = sum(1 for image in existing_images if image in annotations)
    total = len(existing_images)
    remaining = max(total - completed, 0)
    if total == 0:
        status = "empty"
    elif remaining == 0:
        status = "completed"
    else:
        status = "in_progress"
    return {
        "name": data.get("name"),
        "directories": data.get("directories", []),
        "total": total,
        "completed": completed,
        "remaining": remaining,
        "status": status,
    }


def list_tasks() -> List[Dict[str, Any]]:
    tasks: List[Dict[str, Any]] = []
    if not DATA_DIR.exists():
        return tasks
    for path in DATA_DIR.glob("*.json"):
        name = path.stem
        try:
            data = load_task(name)
        except (FileNotFoundError, ValueError):
            continue
        tasks.append(summarise_task(data))
    tasks.sort(key=lambda item: str(item.get("name")))
    return tasks


def next_image_for_task(data: Dict[str, Any]) -> Optional[str]:
    annotations = data.get("annotations", {})
    if not isinstance(annotations, dict):
        annotations = {}
    for item in data.get("images", []):
        if not isinstance(item, str):
            continue
        image_path = Path(item).expanduser().resolve(strict=False)
        if not image_path.exists() or not image_path.is_file():
            continue
        image_key = str(image_path)
        if image_key not in annotations:
            return image_key
    return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/bootstrap")
def api_bootstrap():
    with data_lock:
        tasks = list_tasks()
    directory_tree = build_directory_tree(IMAGES_DIR)
    default_root = IMAGES_DIR.resolve(strict=False) if IMAGES_DIR.exists() else IMAGES_DIR
    return jsonify({
        "directoryTree": directory_tree,
        "tasks": tasks,
        "defaultRoot": str(default_root),
    })


@app.route("/api/directory-tree")
def api_directory_tree():
    raw_path = request.args.get("path", "")
    try:
        base_path = normalise_directory_path(raw_path)
    except Exception:
        return jsonify({"error": "目录路径无效。"}), 400
    if not base_path.exists() or not base_path.is_dir():
        return jsonify({"error": "目录不存在或不可访问。"}), 400
    tree = build_directory_tree(base_path)
    return jsonify({"root": str(base_path.resolve(strict=False)), "tree": tree})


@app.route("/api/tasks", methods=["GET", "POST"])
def api_tasks():
    if request.method == "GET":
        with data_lock:
            tasks = list_tasks()
        return jsonify({"tasks": tasks})

    payload = request.get_json(silent=True) or {}
    raw_name = payload.get("name")
    directories = payload.get("directories")
    try:
        name = validate_task_name(raw_name)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not isinstance(directories, list) or not directories:
        return jsonify({"error": "请选择至少一个图像文件夹。"}), 400
    cleaned_directories: List[str] = []
    for item in directories:
        if not isinstance(item, str):
            return jsonify({"error": "目录参数无效。"}), 400
        cleaned_directories.append(item)
    unique_directories = list(dict.fromkeys(cleaned_directories))
    validated_directories: List[str] = []
    for directory in unique_directories:
        try:
            base = normalise_directory_path(directory)
        except Exception:
            return jsonify({"error": "目录参数无效。"}), 400
        if not base.exists() or not base.is_dir():
            return jsonify({"error": "选择的目录不存在或不可访问。"}), 400
        validated_directories.append(str(base))
    images = collect_images(validated_directories)
    if not images:
        return jsonify({"error": "所选目录中没有可标注的图像。"}), 400
    with data_lock:
        path = task_file(name)
        if path.exists():
            return jsonify({"error": "同名任务已存在。"}), 409
        task_payload = {
            "name": name,
            "directories": validated_directories,
            "images": images,
            "annotations": {},
        }
        save_task(name, task_payload)
    summary = summarise_task(task_payload)
    return jsonify({"task": summary}), 201


@app.route("/api/tasks/<task_name>/next")
def api_task_next(task_name: str):
    try:
        name = validate_task_name(task_name)
    except ValueError:
        return jsonify({"error": "任务名称非法。"}), 400
    with data_lock:
        try:
            task = load_task(name)
        except FileNotFoundError:
            return jsonify({"error": "任务不存在。"}), 404
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 500
        next_image = next_image_for_task(task)
        summary = summarise_task(task)
    response: Dict[str, Any] = {
        "task": name,
        "image": None,
        "total": summary["total"],
        "completed": summary["completed"],
        "remaining": summary["remaining"],
    }
    if next_image:
        image_path = Path(next_image).expanduser().resolve(strict=False)
        directories = task.get("directories", []) if isinstance(task, dict) else []
        display_path = compute_display_path(image_path, directories)
        response["image"] = {
            "path": str(image_path),
            "token": encode_path_token(str(image_path)),
            "name": image_path.name,
            "display_path": display_path,
        }
    return jsonify(response)


@app.route("/api/tasks/<task_name>/annotate", methods=["POST"])
def api_task_annotate(task_name: str):
    try:
        name = validate_task_name(task_name)
    except ValueError:
        return jsonify({"error": "任务名称非法。"}), 400
    payload = request.get_json(silent=True) or {}
    image = payload.get("image")
    rating = payload.get("rating")
    if not image or not isinstance(image, str):
        return jsonify({"error": "缺少图像名称。"}), 400
    if not isinstance(rating, int) or rating < 1 or rating > 5:
        return jsonify({"error": "评分必须是 1-5 的整数。"}), 400
    with data_lock:
        try:
            task = load_task(name)
        except FileNotFoundError:
            return jsonify({"error": "任务不存在。"}), 404
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 500
        valid_images = [item for item in task.get("images", []) if isinstance(item, str)]
        try:
            resolved_image = normalise_image_path(image)
        except Exception:
            return jsonify({"error": "图像路径无效。"}), 400
        image_key = str(resolved_image)
        if image_key not in valid_images:
            return jsonify({"error": "图像不属于该任务。"}), 404
        if not resolved_image.exists() or not resolved_image.is_file():
            return jsonify({"error": "图像文件不存在。"}), 404
        annotations = task.get("annotations", {})
        if not isinstance(annotations, dict):
            annotations = {}
        annotations[image_key] = rating
        task["annotations"] = annotations
        save_task(name, task)
        summary = summarise_task(task)
    return jsonify({"status": "ok", "completed": summary["completed"], "total": summary["total"]})


@app.route("/api/tasks/<task_name>/image")
def api_task_image(task_name: str):
    try:
        name = validate_task_name(task_name)
    except ValueError:
        return jsonify({"error": "任务名称非法。"}), 400
    token = request.args.get("token")
    if not token:
        return jsonify({"error": "缺少图像标识。"}), 400
    try:
        image_path_str = decode_path_token(token)
    except ValueError:
        return jsonify({"error": "图像标识无效。"}), 400
    image_path = Path(image_path_str).expanduser().resolve(strict=False)
    with data_lock:
        try:
            task = load_task(name)
        except FileNotFoundError:
            return jsonify({"error": "任务不存在。"}), 404
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 500
        valid_images = {
            str(Path(item).expanduser().resolve(strict=False))
            for item in task.get("images", [])
            if isinstance(item, str)
        }
    if str(image_path) not in valid_images:
        return jsonify({"error": "图像不属于该任务。"}), 404
    if not image_path.exists() or not image_path.is_file():
        return jsonify({"error": "图像文件不存在。"}), 404
    return send_file(image_path)


def main() -> None:
    app.run(debug=True, host="127.0.0.1", port=5000)


if __name__ == "__main__":
    main()
