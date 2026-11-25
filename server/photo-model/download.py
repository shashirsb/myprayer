"""Install the pinned OpenCV Zoo and Open Model Zoo model weights."""
import hashlib
from pathlib import Path
import sys
from urllib.request import urlopen

zoo = "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/"
models = [
    ("yunet", zoo + "face_detection_yunet/face_detection_yunet_2023mar.onnx", "sha256", "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    ("sface", zoo + "face_recognition_sface/face_recognition_sface_2021dec.onnx", "sha256", "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"),
    ("anti-spoof", "https://storage.openvinotoolkit.org/repositories/open_model_zoo/public/2022.1/anti-spoof-mn3/anti-spoof-mn3.onnx", "sha384", "6de4534964b723397b3e8c995cadcf43bc007cc2f9930b95ae25f76adccece5d1d4d058d0b15117b9e4a9f758424f92a"),
]

if __name__ == "__main__":
    target = Path(sys.argv[1])
    target.mkdir(parents=True, exist_ok=True)
    for name, url, algorithm, expected in models:
        with urlopen(url, timeout=90) as source:
            data = source.read(50_000_001)
        if hashlib.new(algorithm, data).hexdigest() != expected:
            raise ValueError("Model digest mismatch: " + name)
        (target / (name + ".onnx")).write_bytes(data)
