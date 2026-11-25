"""Exercise all three model forward passes with synthetic pixels."""
import os
from pathlib import Path
import cv2 as cv
import numpy as np

p = Path(os.environ["PHOTO_MODEL_DIR"])
image = np.zeros((320, 320, 3), np.uint8)
_, faces = cv.FaceDetectorYN.create(str(p/"yunet.onnx"), "", (320, 320)).detect(image)
assert faces is None
face = cv.FaceRecognizerSF.create(str(p/"sface.onnx"), "")
assert np.isfinite(face.feature(image[:112, :112])).all()
pad = cv.dnn.readNetFromONNX(str(p/"anti-spoof.onnx"))
pad.setInput(np.zeros((1, 3, 128, 128), np.float32))
assert np.isfinite(pad.forward().reshape(2)).all()
