const express = require("express");
const faceapi = require("face-api.js");
const mongoose = require("mongoose");
const { Canvas, Image } = require("canvas");
const canvas = require("canvas");
const fileUpload = require("express-fileupload");
const axios = require('axios');
const url = require('url');
const fs = require('fs');
faceapi.env.monkeyPatch({ Canvas, Image });

// const cors=require("cors");
// const corsOptions ={
//    origin:'*', 
//    credentials:true,            //access-control-allow-credentials:true
//    optionSuccessStatus:200,
// }

const app = express();
// app.use(cors(corsOptions)) 
const baseURL = 'http://localhost:64654'

app.use(
  fileUpload({
    useTempFiles: true,
  })
);


async function LoadModels() {
  // Load the models
  // __dirname gives the root directory of the server
  await faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + "/models");
  await faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + "/models");
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + "/models");
}

LoadModels();

async function deleteTempFiles(images) {
  images.map(image => {
    fs.rmSync(image.replace(/\\\\/g, "/"), {
      force: true,
    });
  })
}

async function uploadLabeledImages(images, identificador, nome, usuario, tipo, aplicativo, local, ip) {
  try {
    let counter = 0;
    const descriptions = [];
    let myImages = [];

    console.log('images', images);

    for (let i = 0; i < images.length; i++) {
      const img = await canvas.loadImage(images[i]);
      myImages.push({ Imagem: ((fs.readFileSync(images[i], 'base64'))) });
      counter = (i / images.length) * 100;
      console.log(`Progress = ${counter}%`);
      const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
      descriptions.push(detections.descriptor);

    }

    let myDescriptors = [];
    descriptions.map(e => {
      myDescriptors.push({ Descriptor: Array.from(e) });
    });

    let pFacePessoa = {
      Cpf: identificador,
      Nome: nome,
      Tipo: tipo,
      FaceDescriptors: myDescriptors,
      FaceImagens: myImages,
      UsuarioCriacao: {
        Id: usuario
      }
    }

    axios.post(`${baseURL}/Face/FacePessoa/Gravar`, {
      pFacePessoa
    }).then(function (response) {
      console.log(response);
      deleteTempFiles(image);
    }).catch(function (error) {
      console.log(error);
      deleteTempFiles(image);
    })

    return true;
  } catch (error) {
    console.log(error);
    return (error);
  }
}

async function getDescriptorsFromDB(image) {
  // Get all the face data from mongodb and loop through each of them to read the data
  let faces = await FaceModel.find();
  console.log(faces);
  for (i = 0; i < faces.length; i++) {
    // Change the face data descriptors from Objects to Float32Array type
    for (j = 0; j < faces[i].descriptions.length; j++) {
      faces[i].descriptions[j] = new Float32Array(Object.values(faces[i].descriptions[j]));
    }
    // Turn the DB face docs to
    faces[i] = new faceapi.LabeledFaceDescriptors(faces[i].label, faces[i].descriptions);
    return (faces[i]);
  }

  // Load face matcher to find the matching face
  const faceMatcher = new faceapi.FaceMatcher(faces, 0.6);

  const img = await canvas.loadImage(image);
  let temp = faceapi.createCanvasFromMedia(img);

  const displaySize = { width: img.width, height: img.height };
  faceapi.matchDimensions(temp, displaySize);

  const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
  const resizedDetections = faceapi.resizeResults(detections, displaySize);
  const results = resizedDetections.map((d) => faceMatcher.findBestMatch(d.descriptor));
  return results;
}

// Metodos para acesso via API

app.get('/home',(req, res)=>{
  res.json({message:'Olaa'})
} )


app.post("/check-face", async (req, res) => {
  try {    
    const File1 = req.files.File1.tempFilePath;
    console.log(File1);
    const img = await canvas.loadImage(File1);
    const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
    console.log(detections.descriptor);   
    res.json({
      floatArray: detections.descriptor
    });
  }
  catch (e) {
    console.log(e);
    res.json({
      floatArray:[]
    });
  }
})

app.post("/gravar-face", async (req, res) => {

  const File1 = req.files.File1.tempFilePath;
  const File2 = req.files.File2.tempFilePath;
  const File3 = req.files.File3.tempFilePath;
  const Identificador = req.body.identificador;
  const Nome = req.body.nome;
  const Usuario = req.body.usuario;
  const Tipo = req.body.tipo;
  const Aplicativo = req.body.aplicativo;
  const Local = req.body.local;
  const IP = req.body.ip;

  let result = await uploadLabeledImages([File1, File2, File3], Identificador, Nome, Usuario, Tipo, Aplicativo, Local, IP);

  if (result) {
    res.json({ message: "Face gravada com sucesso" })
  } else {
    res.json({ message: "Ocorreu um erro ao gravar face." })
  }
})

app.post("/identificar-face", async (req, res) => {
  const File1 = req.files.File1.tempFilePath;
  let result = await getDescriptorsFromDB(File1);
  res.json({ result });

});

app.post("/comparar-face", async (req, res) => {
  const File1 = req.files.File1.tempFilePath;
  const Descriptors = req.body.descriptors;

  let result = await getDescriptorsFromDB(File1);
  res.json({ result });
});

app.listen(process.env.PORT || 5000);
console.log("Server is running on port 5000.");