
class Renderer extends gloperate.Renderer {

    constructor() {
        super();

        this._program = null;

        this._fontTexture = null;

        this._targetTexture = null;
        this._targetFBO = null;

        this._accumulate = null;
    }

    onInitialize(context, callback, mouseEventProvider) {

        const gl = this._context.gl;


        const internalFormatAndType = gloperate.Wizard.queryInternalTextureFormat(
            this._context, gl.RGB, gloperate.Wizard.Precision.byte);


        this._targetTexture = new gloperate.Texture2D(this._context, 'TargetTexture');
        this._targetTexture.initialize(1, 1, 
            internalFormatAndType[0], gl.RGB, internalFormatAndType[1]);

        this._targetFBO = new gloperate.Framebuffer(this._context, 'TargetFBO');
        this._targetFBO.initialize([[this._context.gl2facade.COLOR_ATTACHMENT0, this._targetTexture] ]);      
        this._targetFBO.bind();
    
        this._fontTexture = new gloperate.Texture2D(this._context);
        this._fontTexture.initialize(1, 1, internalFormatAndType[0], gl.RGB, internalFormatAndType[1]);


        const vert = new gloperate.Shader(this._context, gl.VERTEX_SHADER, 'debug (in-line)');
        vert.initialize(this.SHADER_SOURCE_VERT);

        const frag = new gloperate.Shader(this._context, gl.FRAGMENT_SHADER, 'debug (in-line)');
        frag.initialize(this.SHADER_SOURCE_FRAG);

        this._program = new gloperate.Program(this._context, 'DebugProgram');
        this._program.initialize([vert, frag], false);


        this._program.attribute('a_vertex', this._ndcRectangle.vertexLocation);
        this._program.link();       

        this._program.bind();
        gl.uniform1i(this._program.uniform('u_font'), 0);

        this._uNdcOffset = this._program.uniform('u_ndcOffset');

        
        this._accumulate = new gloperate.AccumulatePass(this._context);
        this._accumulate.initialize();
        this._accumulate.precision = gloperate.Wizard.Precision.byte;

        return true;
    }

    protected onUninitialize(): void {
        super.uninitialize();

        this._cuboid.uninitialize();
        this._program.uninitialize();

        this._defaultFBO.uninitialize();
        this._accumulate.uninitialize();
    }


    onDiscarded() {
        this._altered.alter('canvasSize');
        this._altered.alter('clearColor');
        this._altered.alter('frameSize');
        this._altered.alter('multiFrameNumber');
    }

    onUpdate() { 
        this._navigation.update();

        return this._altered.any || this._camera.altered;
    }

    onPrepare() {

        if (this._altered.frameSize) {
            this._intermediateFBO.resize(this._frameSize[0], this._frameSize[1]);
            this._camera.viewport = this._canvasSize;
        }


        if (this._altered.clearColor) {
            this._defaultFBO.clearColor(this._clearColor);
            this._intermediateFBO.clearColor(this._clearColor);
        }

        if (this._altered.multiFrameNumber) {
            this._ndcOffsetKernel = new AntiAliasingKernel(this._multiFrameNumber);
        }

        this._accumulate.update();

        this._altered.reset();
        this._camera.altered = false;
    }

    onFrame() {
        const gl = this._context.gl;

        this._intermediateFBO.bind();
        this._intermediateFBO.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, false, false);


        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        const ndcOffset = this._ndcOffsetKernel.get(frameNumber);
        ndcOffset[0] = 2.0 * ndcOffset[0] / this._frameSize[0];
        ndcOffset[1] = 2.0 * ndcOffset[1] / this._frameSize[1];


        gl.enable(gl.DEPTH_TEST);

        
        this._fontTexture.bind(gl.TEXTURE0);

        this._targetFBO.bind();
        this._program.bind();


        gl.uniform2fv(this._uNdcOffset, ndcOffset);


        // this._ndcRectangle.bind();
        // this._ndcRectangle.draw();
        // this._ndcRectangle.unbind();

        this._program.unbind();
        this._targetFBO.unbind();
        
        this._texture.unbind(gl.TEXTURE0);


        this._accumulate.frame(frameNumber);
    }

    onSwap() { 
        this._blit.framebuffer = this._accumulate.framebuffer ?
        this._accumulate.framebuffer : this._intermediateFBO;
        this._blit.frame();

        // this._blit.srcBounds = this._zoomSrcBounds;
        // this._blit.dstBounds = this._zoomDstBounds;
        // this._blit.frame();
        // this._blit.srcBounds = this._blit.dstBounds = undefined;
    }

    compute(identifier, size, samples) {  
        // this._queue.push([ identifier, Math.min(8192, Math.max(8, size)), samples, this._debug ]);
        // this.invalidate();
    }

    input(file, callback) {

        this._debug = true;

        var fr = new FileReader();
        fr.onload = () => {
            // this._fontTexture.load(fr.result).then(() => {
            //     const gl = this._context.gl;

            //     this._fontTexture.bind(gl.TEXTURE0);
            //     this._fontTexture.wrap(gl.REPEAT, gl.REPEAT, false, false);
            //     this._fontTexture.filter(gl.LINEAR, gl.LINEAR, false, false); 

            //     this._debug = false;

            //     callback();
            // });
        };
        fr.readAsDataURL(file);
    }

}


Renderer.prototype.SHADER_SOURCE_VERT = `
precision highp float;
precision highp int;

#if __VERSION__ == 100
    attribute vec2 a_vertex;
#else
    in vec2 a_vertex;
    #define varying out
#endif

uniform vec2 u_ndcOffset;

varying vec2 v_uv;

void main(void)
{
    vec2 v = a_vertex;
    v_uv = a_vertex;
    
    gl_Position = vec4(a_vertex.xy + u_ndcOffset, 0.0, 1.0);
}
`;


Renderer.prototype.SHADER_SOURCE_FRAG = `
precision highp float;
precision highp int;

#if __VERSION__ == 100
    #define fragColor gl_FragColor
    #define texture texture2D
#else
    layout(location = 0) out vec4 fragColor;
    #define varying in
#endif

uniform sampler2D u_font;

varying vec2 v_uv;

void main(void)
{
    fragColor = texture(u_font, v_uv);
}
`;

