"""Read two camera JPEGs on stdin. Return only the access decision."""
import base64
import json
import os
from pathlib import Path
import sys
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", "4194304")

import cv2 as cv
import numpy as np

cv.setNumThreads(1)
models = Path(os.environ.get("PHOTO_MODEL_DIR", "/opt/myprayer/models"))


def verify(reference_path, direction, frames):
    detector = cv.FaceDetectorYN.create(str(models / "yunet.onnx"), "", (320, 320))
    recognizer = cv.FaceRecognizerSF.create(str(models / "sface.onnx"), "")
    pad = cv.dnn.readNetFromONNX(str(models / "anti-spoof.onnx"))

    def face(image):
        if image is None:
            return None
        detector.setInputSize((image.shape[1], image.shape[0]))
        _, faces = detector.detect(image)
        return faces[0] if faces is not None and len(faces) == 1 else None

    ref = cv.imread(reference_path)
    enrolled = face(ref)
    if enrolled is None:
        raise ValueError("Enrollment unavailable")
    template = recognizer.feature(recognizer.alignCrop(ref, enrolled))
    angles = []
    for frame in frames:
        image = cv.imdecode(np.frombuffer(base64.b64decode(frame, validate=True), np.uint8), cv.IMREAD_COLOR)
        if image is None or max(image.shape[:2]) > 800:
            return False
        box = face(image)
        if box is None:
            return False
        feature = recognizer.feature(recognizer.alignCrop(image, box))
        if not recognizer.match(template, feature, cv.FaceRecognizerSF_FR_COSINE) >= 0.40:
            return False
        x, y, w, h = map(int, box[:4])
        crop = image[max(0, y):y+h, max(0, x):x+w]
        if min(crop.shape[:2]) < 60:
            return False
        rgb = cv.cvtColor(cv.resize(crop, (128, 128)), cv.COLOR_BGR2RGB)
        tensor = ((rgb - np.array([151.2405, 119.5950, 107.8395])) /
                  np.array([63.0105, 56.4570, 55.0035])).astype(np.float32)
        pad.setInput(tensor.transpose(2, 0, 1)[None])
        real, _ = pad.forward().reshape(2)
        if not real >= 0.90:
            return False
        eyes = sorted([float(box[4]), float(box[6])])
        if eyes[1] - eyes[0] < 15:
            return False
        angles.append((float(box[8]) - sum(eyes)/2) / (eyes[1] - eyes[0]))
    # User's left projects toward increasing x on the unmirrored camera frame.
    sign = 1 if direction == "left" else -1
    return abs(angles[0]) <= 0.18 and sign * (angles[1] - angles[0]) > 0.20


if __name__ == "__main__":
    frames = json.load(sys.stdin)
    print("verified" if verify(sys.argv[1], sys.argv[2], frames) else "denied")
